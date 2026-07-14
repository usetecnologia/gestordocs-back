import { BadRequestException } from '@nestjs/common';
import { envs } from '@config/envs';

export interface TemplateVariableDefinition {
  key: string;
  label: string;
  description: string;
}

// Única fuente de verdad de qué variables existen — tanto el endpoint que las expone al
// frontend (para que se seleccionen, no se escriban a mano) como el tipo que usa el motor de
// sustitución se derivan de esta misma lista, para que nunca queden desincronizados.
export const TEMPLATE_VARIABLE_DEFINITIONS = [
  {
    key: 'nombreParticipante',
    label: 'Nombre del participante',
    description: 'Nombre completo del participante que recibe el correo.',
  },
  {
    key: 'nombrePrograma',
    label: 'Programa',
    description: 'Nombre del programa asociado al participante.',
  },
  {
    key: 'nombreSponsor',
    label: 'Sponsor',
    description: 'Nombre del sponsor asociado al participante.',
  },
  {
    key: 'nombreDocumento',
    label: 'Documento',
    description:
      'Nombre del documento relacionado al evento que disparó el correo (vacío si la acción no es de tipo documento).',
  },
  {
    key: 'enlace',
    label: 'Enlace a la plataforma',
    description: 'URL base del frontend.',
  },
  {
    key: 'fechaActual',
    label: 'Fecha actual',
    description: 'Fecha de envío en hora de Perú (America/Lima).',
  },
] as const satisfies readonly TemplateVariableDefinition[];

export type TemplateVariableKey = (typeof TEMPLATE_VARIABLE_DEFINITIONS)[number]['key'];

export type EmailTemplateVariables = Record<TemplateVariableKey, string>;

function formatFechaActualLima(): string {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}

export function buildTemplateVariables(
  partial: Partial<Omit<EmailTemplateVariables, 'fechaActual'>>,
): EmailTemplateVariables {
  return {
    nombreParticipante: partial.nombreParticipante ?? '',
    nombrePrograma: partial.nombrePrograma ?? '',
    nombreSponsor: partial.nombreSponsor ?? '',
    nombreDocumento: partial.nombreDocumento ?? '',
    enlace: partial.enlace ?? envs.FRONTEND_URL,
    fechaActual: formatFechaActualLima(),
  };
}

export function substituteTemplateVariables(
  text: string,
  variables: EmailTemplateVariables,
): string {
  return text.replace(/{{\s*(\w+)\s*}}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(variables, key)
      ? variables[key as keyof EmailTemplateVariables]
      : match,
  );
}

const VALID_TEMPLATE_VARIABLE_KEYS = new Set<string>(
  TEMPLATE_VARIABLE_DEFINITIONS.map((v) => v.key),
);

export function findUnknownTemplateTokens(text: string): string[] {
  const unknown = new Set<string>();
  for (const match of text.matchAll(/{{\s*(\w+)\s*}}/g)) {
    if (!VALID_TEMPLATE_VARIABLE_KEYS.has(match[1])) unknown.add(match[1]);
  }
  return [...unknown];
}

// Rechaza cualquier {{token}} que no esté en TEMPLATE_VARIABLE_DEFINITIONS — evita que
// queden variantes como {{name}}/{{nombre}}/{{fullname}} en el HTML que el backend nunca
// va a poder sustituir al enviar el correo.
export function assertKnownTemplateVariables(subject: string, htmlContent: string): void {
  const unknown = [
    ...new Set([...findUnknownTemplateTokens(subject), ...findUnknownTemplateTokens(htmlContent)]),
  ];
  if (unknown.length > 0) {
    throw new BadRequestException(
      `Variable(s) desconocida(s): ${unknown.map((k) => `{{${k}}}`).join(', ')}. ` +
        'Usa GET /plantillas-correo/variables para ver el catálogo permitido.',
    );
  }
}
