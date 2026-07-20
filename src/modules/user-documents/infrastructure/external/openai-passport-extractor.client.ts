import { Injectable, InternalServerErrorException } from '@nestjs/common';
import OpenAI from 'openai';
import { envs } from '@config/envs';
import { PassportData } from '../../domain/passport-data';
import { IPassportExtractorPort, PassportSourceFile } from '../../domain/passport-extractor.port';

const PASSPORT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    tipoDocumento: { type: ['string', 'null'], description: 'Tipo de documento tal como aparece impreso, p. ej. "PASAPORTE", "P".' },
    numeroPasaporte: { type: ['string', 'null'] },
    codigoPaisEmisor: { type: ['string', 'null'], description: 'Código de país emisor de 3 letras (ISO 3166-1 alpha-3), leído preferentemente de la MRZ.' },
    paisEmisor: { type: ['string', 'null'], description: 'Nombre completo del país u organismo emisor.' },
    apellidos: { type: ['string', 'null'] },
    nombres: { type: ['string', 'null'] },
    nacionalidad: { type: ['string', 'null'] },
    sexo: { type: ['string', 'null'], description: 'M, F o X, tal como aparece en el documento.' },
    fechaNacimiento: { type: ['string', 'null'], description: 'Formato estricto YYYY-MM-DD. null si no es legible.' },
    lugarNacimiento: { type: ['string', 'null'] },
    fechaEmision: { type: ['string', 'null'], description: 'Fecha de emisión/expedición del pasaporte. Formato estricto YYYY-MM-DD. null si no es legible.' },
    fechaVencimiento: { type: ['string', 'null'], description: 'Fecha de expiración/vencimiento. Formato estricto YYYY-MM-DD. null si no es legible.' },
    autoridadEmisora: { type: ['string', 'null'] },
    numeroPersonal: { type: ['string', 'null'], description: 'Número personal/CUI/documento nacional si aparece impreso.' },
    mrz: { type: ['string', 'null'], description: 'Las 2 (o 3) líneas de la Machine Readable Zone, tal cual aparecen, unidas con salto de línea.' },
    observaciones: { type: ['string', 'null'], description: 'Notas sobre legibilidad, inconsistencias entre la MRZ y la zona visual, o cualquier anomalía detectada.' },
  },
  required: [
    'tipoDocumento',
    'numeroPasaporte',
    'codigoPaisEmisor',
    'paisEmisor',
    'apellidos',
    'nombres',
    'nacionalidad',
    'sexo',
    'fechaNacimiento',
    'lugarNacimiento',
    'fechaEmision',
    'fechaVencimiento',
    'autoridadEmisora',
    'numeroPersonal',
    'mrz',
    'observaciones',
  ],
} as const;

const EXTRACTION_PROMPT = `Eres un experto forense en documentos de identidad con más de 20 años de experiencia en control migratorio, especializado en la lectura óptica y validación de pasaportes de cualquier país del mundo (formatos ICAO Doc 9303).

Se te entregará la imagen o el PDF de un pasaporte. Tu tarea es extraer TODA la información visible del documento con la máxima precisión posible, prestando especial atención a:
1. FECHA DE EMISIÓN (fechaEmision)
2. FECHA DE NACIMIENTO (fechaNacimiento)
3. FECHA DE VENCIMIENTO (fechaVencimiento)

Instrucciones estrictas:
- Lee tanto la zona visual (VIZ) como la zona de lectura mecánica (MRZ, las 2-3 líneas de caracteres monoespaciados con "<" en la parte inferior) si están presentes.
- Si una fecha aparece en ambas zonas y difiere, prioriza la zona visual (VIZ) pero indícalo en "observaciones".
- Todas las fechas deben devolverse en formato estricto ISO "YYYY-MM-DD". Si el documento muestra la fecha en otro formato (DD/MM/YY, DD MMM YYYY, etc.), conviértela correctamente, resolviendo el siglo con criterio (p. ej. una fecha de nacimiento con año "95" normalmente es 1995, no 2095; usa el contexto del documento para decidir).
- Nunca inventes ni completes datos que no puedas leer con confianza: si un campo no es legible o no existe en el documento, devuelve null en ese campo. No adivines.
- No confundas fecha de emisión con fecha de nacimiento ni con fecha de vencimiento: son tres fechas distintas casi siempre presentes en un pasaporte.
- Transcribe nombres y apellidos exactamente como aparecen impresos (incluye tildes/diacríticos si el documento los muestra en la zona visual).
- El código de país emisor debe ser el código ISO 3166-1 alpha-3 (3 letras, p. ej. PER, USA, MEX), tomado preferentemente de la MRZ.
- Si el archivo es un PDF con varias páginas, considera todas las páginas relevantes al documento.
- Responde ÚNICAMENTE con el JSON que cumple el esquema proporcionado, sin texto adicional.`;

@Injectable()
export class OpenAiPassportExtractorClient implements IPassportExtractorPort {
  private readonly client = new OpenAI({ apiKey: envs.OPENAI_API_KEY });
  private readonly model = envs.OPENAI_PASSPORT_MODEL;

  async extract(file: PassportSourceFile): Promise<PassportData> {
    const dataUri = `data:${file.contentType};base64,${file.buffer.toString('base64')}`;
    const isPdf = file.contentType === 'application/pdf';

    let response;
    try {
      response = await this.client.responses.create({
        model: this.model,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: EXTRACTION_PROMPT },
              isPdf
                ? { type: 'input_file', filename: file.filename, file_data: dataUri }
                : { type: 'input_image', image_url: dataUri, detail: 'high' },
            ],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'passport_data',
            schema: PASSPORT_JSON_SCHEMA,
            strict: true,
          },
        },
      });
    } catch (err) {
      throw new InternalServerErrorException(
        `Error al consultar OpenAI para extraer datos del pasaporte: ${(err as Error).message}`,
      );
    }

    const outputText = response.output_text;
    if (!outputText) {
      throw new InternalServerErrorException('OpenAI no devolvió contenido para el pasaporte proporcionado.');
    }

    return JSON.parse(outputText) as PassportData;
  }
}
