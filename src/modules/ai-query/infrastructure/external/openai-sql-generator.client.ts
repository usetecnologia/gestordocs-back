import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import OpenAI from 'openai';
import { envs } from '@config/envs';
import { buildSchemaDescription } from '../../domain/database-catalog';
import {
  GeneratedSql,
  ISqlGeneratorPort,
} from '../../domain/sql-generator.port';

const SQL_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    sql: {
      type: ['string', 'null'],
      description:
        'Sentencia SELECT de MariaDB que responde la pregunta. null si la pregunta no puede responderse.',
    },
    explanation: {
      type: 'string',
      description:
        'Explicación breve en español de qué devuelve la consulta (una o dos frases).',
    },
    rejectionReason: {
      type: ['string', 'null'],
      description:
        'Si sql es null, motivo en español dirigido al usuario. null cuando sí se generó SQL.',
    },
  },
  required: ['sql', 'explanation', 'rejectionReason'],
} as const;

@Injectable()
export class OpenAiSqlGeneratorClient implements ISqlGeneratorPort {
  private readonly logger = new Logger(OpenAiSqlGeneratorClient.name);

  private readonly client = new OpenAI({
    apiKey: envs.OPENAI_API_KEY,
    timeout: 60_000,
    maxRetries: 1,
  });

  private readonly model = envs.OPENAI_SQL_MODEL;
  private readonly schemaDescription = buildSchemaDescription();

  async generate(question: string, maxRows: number): Promise<GeneratedSql> {
    let response;
    try {
      response = await this.client.responses.create({
        model: this.model,
        input: [
          { role: 'system', content: this.buildSystemPrompt(maxRows) },
          { role: 'user', content: question },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'sql_query',
            schema: SQL_JSON_SCHEMA,
            strict: true,
          },
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(
        `Error al consultar OpenAI para generar SQL: ${message}`,
      );
      throw new InternalServerErrorException(
        'No se pudo generar la consulta. Inténtalo de nuevo en unos segundos.',
      );
    }

    const outputText = response.output_text;
    if (!outputText) {
      throw new InternalServerErrorException(
        'El modelo no devolvió ninguna consulta.',
      );
    }

    return JSON.parse(outputText) as GeneratedSql;
  }

  private buildSystemPrompt(maxRows: number): string {
    const today = new Date().toISOString().slice(0, 10);

    return `Eres un experto en SQL de MariaDB/MySQL. Traduces preguntas en español de un administrador a una única sentencia SELECT sobre el esquema que se describe más abajo. Hoy es ${today}.

REGLAS INQUEBRANTABLES
1. Genera EXCLUSIVAMENTE sentencias de lectura: SELECT (o WITH ... SELECT). Está terminantemente prohibido INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, GRANT, o cualquier otra instrucción que modifique datos o estructura. Si el usuario pide modificar, borrar o crear algo, devuelve sql = null y explica en rejectionReason que esta herramienta es solo de consulta.
2. Una sola sentencia. Sin punto y coma final, sin comentarios SQL (--, #, /* */), sin variables de sesión (@@).
3. Nunca uses SELECT *. Enumera siempre las columnas necesarias y ponles alias legibles en español (por ejemplo: u.email AS correo).
4. Usa únicamente las tablas y columnas listadas en el esquema. Si la pregunta requiere datos que no existen ahí, devuelve sql = null y explícalo en rejectionReason.
5. Incluye SIEMPRE una cláusula LIMIT. El máximo permitido es ${maxRows}; si el usuario no indica cuántos registros quiere, usa un LIMIT razonable (por ejemplo 50).
6. Los nombres de tabla respetan mayúsculas y minúsculas exactamente como aparecen en el esquema. Enciérralos en backticks (\`User\`, \`documents\`). La columna \`order\` es palabra reservada: siempre con backticks.
7. Nunca consultes ni menciones contraseñas ni columnas de credenciales: no forman parte del esquema.
8. Ordena los resultados de forma útil (por ejemplo ORDER BY fecha de creación DESC cuando se piden "los últimos" o "los más recientes").

CONOCIMIENTO DEL NEGOCIO
- Un "participante" es una fila de \`User\` cuyo rol tiene code = 'PARTICIPANTE': une con \`Role\` (\`User\`.role_id = \`Role\`.id) y filtra por \`Role\`.code.
- Los nombres y el DNI NO están en \`User\`: están en \`Person\`, que se une por id (\`Person\`.id = \`User\`.id). Para mostrar el nombre completo usa CONCAT_WS(' ', p.firstname, p.lastfathername, p.lastmothername).
- "Usuarios registrados" o "últimos usuarios" se ordenan por \`User\`.created_at DESC.
- Los documentos vigentes de un participante son las filas de \`UserDocuments\` con status_document = 1; el resto es histórico.
- Una observación de participante está activa cuando \`UserObservations\`.status = 1 y endDate IS NULL.
- Las columnas de tipo boolean se guardan como 1/0 (tinyint).
- Varias fechas del negocio (hired_date, birthdate, fechadeenvioalsponsor…) son texto, no DATE: no las uses en cálculos de fechas; para filtrar por periodos usa created_at, updated_at o sent_at.

SALIDA
Devuelve solo el JSON del esquema indicado. En "explanation" describe en una o dos frases, en español y sin jerga SQL, qué devuelve la consulta.

ESQUEMA DE LA BASE DE DATOS
${this.schemaDescription}`;
  }
}
