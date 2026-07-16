export type EmailActionScope = 'USER' | 'DOCUMENT';

export interface ActionStatusMapping {
  scope: EmailActionScope;
  status: string;
}

// Vincula cada código de acción de correo con el estado real del sistema que lo dispara.
export const ACTION_STATUS_MAP: Record<string, ActionStatusMapping> = {
  DOCUMENTO_OBSERVADO: { scope: 'DOCUMENT', status: 'OBSERVADO' },
  USER_OBSERVADO: { scope: 'USER', status: 'OBSERVADO' },
};

export function findActionCodeByStatus(scope: EmailActionScope, status: string): string | null {
  for (const [code, mapping] of Object.entries(ACTION_STATUS_MAP)) {
    if (mapping.scope === scope && mapping.status === status) return code;
  }
  return null;
}
