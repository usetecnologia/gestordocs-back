export type EmailActionScope = 'USER' | 'DOCUMENT';

export interface ActionStatusMapping {
  scope: EmailActionScope;
  status: string;
}

// Vincula cada código de acción de correo con el estado real del sistema que lo dispara.
// BIENVENIDA_PARTICIPANTE y RECUPERACION_CONTRASENA quedan fuera a propósito: son acciones
// de evento puntual (no un estado persistente), así que el scheduler de plantillas PROGRAMADA
// no tiene audiencia que resolver para ellas — solo aplican a plantillas de tipo NORMAL.
export const ACTION_STATUS_MAP: Record<string, ActionStatusMapping> = {
  DOCUMENTO_SUBIDO: { scope: 'DOCUMENT', status: 'SUBIDO' },
  DOCUMENTO_OBSERVADO: { scope: 'DOCUMENT', status: 'OBSERVADO' },
  DOCUMENTO_APROBADO: { scope: 'DOCUMENT', status: 'REVISADO' },
  PARTICIPANTE_DOCUMENTOS_INCOMPLETOS: { scope: 'USER', status: 'DOCUMENTOS_INCOMPLETOS' },
  PARTICIPANTE_PENDIENTE_REVISION: { scope: 'USER', status: 'PENDIENTE_REVISAR' },
  PARTICIPANTE_OBSERVADO: { scope: 'USER', status: 'OBSERVADO' },
  PARTICIPANTE_EN_PREPARACION: { scope: 'USER', status: 'PREPARACION' },
  PARTICIPANTE_ENVIADO_SPONSOR: { scope: 'USER', status: 'ENVIADO_SPONSOR' },
  PARTICIPANTE_OBSERVADO_SPONSOR: { scope: 'USER', status: 'OBSERVADO_SPONSOR' },
  PARTICIPANTE_RECHAZADO_SPONSOR: { scope: 'USER', status: 'RECHAZADO_SPONSOR' },
  PARTICIPANTE_APROBADO_SPONSOR: { scope: 'USER', status: 'APROBADO_SPONSOR' },
  PARTICIPANTE_DS2019_EMITIDO: { scope: 'USER', status: 'DS2019_EMITIDO' },
  PARTICIPANTE_RETIRADO: { scope: 'USER', status: 'RETIRADO' },
};

export function findActionCodeByStatus(scope: EmailActionScope, status: string): string | null {
  for (const [code, mapping] of Object.entries(ACTION_STATUS_MAP)) {
    if (mapping.scope === scope && mapping.status === status) return code;
  }
  return null;
}
