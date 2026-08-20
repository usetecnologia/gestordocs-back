/**
 * Códigos de rol tal como viajan en el JWT. Los tres caminos que firman token
 * (autologin, login, refresh-token) usan `role.code ?? role.name`, así que el valor
 * es el `code` de la tabla `Role` salvo que sea nulo.
 */
export enum RoleCode {
  ADMIN = 'ADMIN',
  SUPERVISOR = 'SUPERVISOR',
  ASESOR = 'ASESOR',
  PARTICIPANTE = 'PARTICIPANTE',
}

/**
 * Personal interno de USE: todo el que no es participante. Es el grupo autorizado a revisar
 * expedientes ajenos, aprobar u observar documentos y —cuando exista— finalizar procesos.
 */
export const STAFF_ROLES = [RoleCode.ADMIN, RoleCode.SUPERVISOR, RoleCode.ASESOR] as const;

/** Staff más el propio participante. El acceso al expediente ajeno se restringe aparte. */
export const STAFF_AND_PARTICIPANT_ROLES = [...STAFF_ROLES, RoleCode.PARTICIPANTE] as const;
