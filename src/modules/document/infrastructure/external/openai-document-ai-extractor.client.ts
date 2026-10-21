import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import OpenAI from 'openai';
import { envs } from '@config/envs';
import type { PassportExtraction } from '../../domain/ai/passport-extraction';
import { Td3Line2Fields, assembleTd3Line2, readTd3Mrz } from '../../domain/ai/mrz-td3';
import {
  ADDITIONAL_INSTRUCTIONS_PREFIX,
  PASSPORT_BASE_PROMPT,
  PASSPORT_LAYOUT_PROMPT,
  PASSPORT_MRZ_REREAD_PROMPT,
} from '../../domain/ai/passport-prompt';
import {
  ClockwiseRotation,
  PreparedImage,
  cropMrzBand,
  preparePages,
  rotateClockwise,
  thumbnail,
  toDataUri,
} from './passport-image-preparer';
import type {
  AiExtractionSourceFile,
  IDocumentAiExtractorPort,
  PassportExtractionOutput,
} from '../../domain/ai/document-ai-extractor.port';

const CONFIDENCE = { type: ['string', 'null'], enum: ['ALTA', 'MEDIA', 'BAJA', null] } as const;

const TEXT_FIELD = {
  type: 'object',
  additionalProperties: false,
  properties: {
    valor: { type: ['string', 'null'] },
    confianza: CONFIDENCE,
  },
  required: ['valor', 'confianza'],
} as const;

const DATE_FIELD = {
  type: 'object',
  additionalProperties: false,
  properties: {
    textoOriginal: { type: ['string', 'null'], description: 'Texto exacto impreso, p. ej. "12 ENE/JAN 2019".' },
    valor: { type: ['string', 'null'], description: 'YYYY-MM-DD. null si día, mes o año no se leen con certeza.' },
    confianza: CONFIDENCE,
  },
  required: ['textoOriginal', 'valor', 'confianza'],
} as const;

const VIZ_TEXT_FIELDS = [
  'tipoDocumento',
  'codigoPaisEmisor',
  'paisEmisor',
  'numeroPasaporte',
  'apellidos',
  'nombres',
  'nacionalidad',
  'sexo',
  'lugarNacimiento',
  'autoridadEmisora',
  'numeroPersonal',
] as const;
const VIZ_DATE_FIELDS = ['fechaNacimiento', 'fechaEmision', 'fechaVencimiento'] as const;

/**
 * Pistas por campo. Sin descripción, la IA no asociaba "numeroPersonal" con la etiqueta
 * "DNI No. / National ID No." de los pasaportes peruanos y a veces lo dejaba vacío.
 */
const VIZ_FIELD_DESCRIPTIONS: Partial<Record<(typeof VIZ_TEXT_FIELDS)[number], string>> = {
  numeroPasaporte: 'Número del pasaporte (etiqueta "Pasaporte No. / Passport No."). No confundir con el número de serie impreso aparte.',
  numeroPersonal:
    'DNI o número de identidad nacional impreso en la zona visual, con etiquetas como "DNI No.", ' +
    '"National ID No.", "Número personal", "Personal No." o "CUI". Transcríbelo aunque la MRZ no lo incluya.',
  codigoPaisEmisor: 'Código de 3 letras del país emisor (etiqueta "Código país / Country code").',
  nacionalidad: 'Nacionalidad tal como está impresa, p. ej. "PERUANA".',
};

/** Debe corresponder 1:1 con `PassportExtraction`: el modo strict obliga a la IA a respetarlo. */
const PASSPORT_EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    clasificacion: {
      type: 'object',
      additionalProperties: false,
      properties: {
        tipo: { type: 'string', enum: ['PASAPORTE', 'OTRO_DOCUMENTO_IDENTIDAD', 'PLANTILLA_EN_BLANCO', 'NO_RELACIONADO'] },
        descripcion: { type: ['string', 'null'], description: 'Qué es el archivo, en una frase.' },
        paginaDatosVisible: { type: 'boolean' },
        paginaDatos: { type: ['integer', 'null'] },
      },
      required: ['tipo', 'descripcion', 'paginaDatosVisible', 'paginaDatos'],
    },
    calidad: {
      type: 'object',
      additionalProperties: false,
      properties: {
        legibilidad: { type: 'string', enum: ['BUENA', 'REGULAR', 'MALA'] },
        origen: {
          type: 'string',
          enum: ['ESCANEO', 'FOTO_DEL_DOCUMENTO', 'FOTO_DE_PANTALLA', 'CAPTURA_DE_PANTALLA', 'FOTOCOPIA', 'DESCONOCIDO'],
        },
        problemas: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['BORROSA', 'REFLEJOS', 'RECORTADA', 'ROTADA', 'BAJA_RESOLUCION', 'OSCURA', 'OBSTRUIDA'],
          },
        },
      },
      required: ['legibilidad', 'origen', 'problemas'],
    },
    viz: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...Object.fromEntries(
          VIZ_TEXT_FIELDS.map((f) => [
            f,
            VIZ_FIELD_DESCRIPTIONS[f] ? { ...TEXT_FIELD, description: VIZ_FIELD_DESCRIPTIONS[f] } : TEXT_FIELD,
          ]),
        ),
        ...Object.fromEntries(VIZ_DATE_FIELDS.map((f) => [f, DATE_FIELD])),
      },
      required: [...VIZ_TEXT_FIELDS, ...VIZ_DATE_FIELDS],
    },
    mrz: {
      type: 'object',
      additionalProperties: false,
      properties: {
        lineas: { type: 'array', items: { type: 'string' } },
        confianza: CONFIDENCE,
      },
      required: ['lineas', 'confianza'],
    },
    fotoTitularPresente: { type: 'boolean' },
    firmaPresente: { type: 'boolean' },
    alteraciones: { type: 'array', items: { type: 'string' } },
    observaciones: { type: ['string', 'null'] },
  },
  required: [
    'clasificacion',
    'calidad',
    'viz',
    'mrz',
    'fotoTitularPresente',
    'firmaPresente',
    'alteraciones',
    'observaciones',
  ],
};

const ROTATION_OPTIONS = ['A', 'B', 'C', 'D'] as const;
type RotationOption = (typeof ROTATION_OPTIONS)[number];
const ROTATION_BY_OPTION: Record<RotationOption, ClockwiseRotation> = { A: 0, B: 90, C: 180, D: 270 };

const LAYOUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    paginaDatos: { type: ['integer', 'null'] },
    opcionDerecha: { type: 'string', enum: [...ROTATION_OPTIONS] },
  },
  required: ['paginaDatos', 'opcionDerecha'],
};

interface PageLayout {
  paginaDatos: number | null;
  opcionDerecha: RotationOption;
}

const MRZ_FIELD = { type: 'string' } as const;
const MRZ_LINE2_KEYS = [
  'numero', 'digitoNumero', 'nacionalidad', 'nacimiento', 'digitoNacimiento', 'sexo',
  'vencimiento', 'digitoVencimiento', 'numeroPersonal', 'digitoPersonal', 'digitoFinal',
] as const;
const MRZ_REREAD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    linea1: MRZ_FIELD,
    linea2: {
      type: 'object',
      additionalProperties: false,
      properties: Object.fromEntries(MRZ_LINE2_KEYS.map((k) => [k, MRZ_FIELD])),
      required: [...MRZ_LINE2_KEYS],
    },
  },
  required: ['linea1', 'linea2'],
};

interface MrzReread {
  linea1: string;
  linea2: Td3Line2Fields;
}

interface ExtractionAttempt {
  extraction: PassportExtraction;
  rotation: ClockwiseRotation;
  /** La MRZ salió de la relectura campo por campo, no de la lectura general. */
  mrzReread: boolean;
  /** Dígitos de control que coinciden: es lo que decide qué intento es la lectura correcta. */
  validChecks: number;
  mrzValid: boolean;
}

type ResponseContent = OpenAI.Responses.ResponseInputContent;

@Injectable()
export class OpenAiDocumentAiExtractorClient implements IDocumentAiExtractorPort {
  // Mismos topes que el extractor de la revisión masiva: los modelos de razonamiento tardan
  // bastante con una imagen en detail 'high'.
  private readonly client = new OpenAI({
    apiKey: envs.OPENAI_API_KEY,
    timeout: 300_000,
    maxRetries: 1,
  });
  private readonly model = envs.OPENAI_PASSPORT_MODEL;

  async extractPassport(
    file: AiExtractionSourceFile,
    additionalInstructions: string | null,
  ): Promise<PassportExtractionOutput> {
    const { pages, totalPages } = await this.preparePagesOrFail(file);
    const layout = await this.detectLayout(pages);

    // Si no se ubicó la página de datos, se lee la primera igual: la extracción la clasificará
    // y dirá qué es el archivo, que es justo lo que el administrador necesita ver.
    const pageIndex =
      layout.paginaDatos && layout.paginaDatos >= 1 && layout.paginaDatos <= pages.length
        ? layout.paginaDatos - 1
        : 0;
    const page = pages[pageIndex];
    const rotation = ROTATION_BY_OPTION[layout.opcionDerecha];

    let best = await this.attempt(page, rotation, additionalInstructions);
    let attempts = 1;

    // La orientación la estima la IA y a veces confunde el sentido (90° con 270°). Los dígitos de
    // control de la MRZ son un árbitro objetivo: si la lectura no los supera, se prueba la
    // orientación opuesta y se queda la que más dígitos confirma. Solo cuesta una llamada extra
    // cuando la primera lectura ya salió mal.
    if (!best.mrzValid && best.extraction.clasificacion.tipo === 'PASAPORTE') {
      const opposite = ((rotation + 180) % 360) as ClockwiseRotation;
      const retry = await this.attempt(page, opposite, additionalInstructions);
      attempts++;
      if (retry.validChecks > best.validChecks) best = retry;
    }

    return {
      extraction: {
        ...best.extraction,
        clasificacion: { ...best.extraction.clasificacion, paginaDatos: layout.paginaDatos },
      },
      preparacion: {
        totalPaginas: totalPages,
        paginaUsada: pageIndex + 1,
        rotacionAplicada: best.rotation,
        intentos: attempts,
        mrzReleida: best.mrzReread,
      },
    };
  }

  private async attempt(
    page: PreparedImage,
    rotation: ClockwiseRotation,
    additionalInstructions: string | null,
  ): Promise<ExtractionAttempt> {
    const upright = await rotateClockwise(page, rotation);
    const mrzBand = await cropMrzBand(upright);

    // Las instrucciones del administrador van en un bloque aparte y subordinado al prompt base,
    // para que una indicación mal redactada no pueda pisar las reglas de transcripción.
    const instructionsBlock: ResponseContent[] = additionalInstructions?.trim()
      ? [{ type: 'input_text', text: `${ADDITIONAL_INSTRUCTIONS_PREFIX}\n${additionalInstructions.trim()}` }]
      : [];

    const extraction = await this.callModel<PassportExtraction>(
      [
        { type: 'input_text', text: PASSPORT_BASE_PROMPT },
        ...instructionsBlock,
        { type: 'input_text', text: 'Imagen 1: página completa, ya enderezada.' },
        { type: 'input_image', image_url: toDataUri(upright), detail: 'high' },
        { type: 'input_text', text: 'Imagen 2: recorte ampliado de la parte inferior (MRZ).' },
        { type: 'input_image', image_url: toDataUri(mrzBand), detail: 'high' },
      ],
      'passport_extraction',
      PASSPORT_EXTRACTION_SCHEMA,
    );

    const first = this.scoreMrz(extraction.mrz.lineas);
    if (first.mrzValid || extraction.clasificacion.tipo !== 'PASAPORTE') {
      return { extraction, rotation, mrzReread: false, ...first };
    }

    // La lectura general a veces se salta un dígito de verificación y compensa con un "<" de
    // más: la línea queda en 44 caracteres pero corrida. Se relee solo la MRZ, campo por campo,
    // y se usa únicamente si la relectura sí supera la verificación. Nada se completa en código.
    const reread = await this.rereadMrz(mrzBand);
    const rereadLines = [reread.linea1, assembleTd3Line2(reread.linea2)];
    const second = this.scoreMrz(rereadLines);
    if (second.validChecks > first.validChecks) {
      return {
        extraction: { ...extraction, mrz: { ...extraction.mrz, lineas: rereadLines } },
        rotation,
        mrzReread: true,
        ...second,
      };
    }
    return { extraction, rotation, mrzReread: false, ...first };
  }

  private scoreMrz(lines: string[]): { validChecks: number; mrzValid: boolean } {
    const mrz = readTd3Mrz(lines);
    return {
      validChecks: mrz.estado === 'LEIDA' ? mrz.checks.filter((c) => c.valido).length : 0,
      mrzValid: mrz.estado === 'LEIDA' && mrz.valida,
    };
  }

  private rereadMrz(mrzBand: PreparedImage): Promise<MrzReread> {
    return this.callModel<MrzReread>(
      [
        { type: 'input_text', text: PASSPORT_MRZ_REREAD_PROMPT },
        { type: 'input_image', image_url: toDataUri(mrzBand), detail: 'high' },
      ],
      'passport_mrz_reread',
      MRZ_REREAD_SCHEMA,
    );
  }

  private async preparePagesOrFail(
    file: AiExtractionSourceFile,
  ): Promise<{ pages: PreparedImage[]; totalPages: number }> {
    try {
      const prepared = await preparePages(file.buffer, file.contentType);
      if (prepared.pages.length === 0) throw new Error('el archivo no tiene páginas');
      return prepared;
    } catch (err) {
      throw new BadRequestException(
        `No se pudo abrir el archivo para leerlo (¿está dañado o protegido?): ${(err as Error).message}`,
      );
    }
  }

  /**
   * Ubica la página de datos y su orientación. A la IA no se le pide calcular cuántos grados girar
   * (lo hace mal: confunde el sentido), sino elegir cuál de las cuatro versiones se lee derecha,
   * que es algo que reconoce bien.
   */
  private async detectLayout(pages: PreparedImage[]): Promise<PageLayout> {
    const content: ResponseContent[] = [{ type: 'input_text', text: PASSPORT_LAYOUT_PROMPT }];
    for (const [i, page] of pages.entries()) {
      const small = await thumbnail(page);
      for (const option of ROTATION_OPTIONS) {
        const rotated = await rotateClockwise(small, ROTATION_BY_OPTION[option]);
        content.push(
          { type: 'input_text', text: `Página ${i + 1}, opción ${option}:` },
          { type: 'input_image', image_url: toDataUri(rotated), detail: 'low' },
        );
      }
    }
    return this.callModel<PageLayout>(content, 'passport_layout', LAYOUT_SCHEMA);
  }

  private async callModel<T>(
    content: ResponseContent[],
    schemaName: string,
    schema: Record<string, unknown>,
  ): Promise<T> {
    let response;
    try {
      response = await this.client.responses.create({
        model: this.model,
        input: [{ role: 'user', content }],
        text: { format: { type: 'json_schema', name: schemaName, schema, strict: true } },
      });
    } catch (err) {
      throw new InternalServerErrorException(`No se pudo consultar a la IA: ${(err as Error).message}`);
    }
    if (!response.output_text) {
      throw new InternalServerErrorException('La IA no devolvió ningún resultado para este archivo.');
    }
    return JSON.parse(response.output_text) as T;
  }
}
