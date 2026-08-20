import { SetMetadata } from '@nestjs/common';
import type { RoleCode } from '@common/enums/role-code.enum';

export const ROLES_KEY = 'roles';

/**
 * Declara qué roles pueden ejecutar el endpoint. `RolesGuard` deniega por defecto: un handler
 * sin este decorador queda inaccesible, para que agregar una ruta nueva y olvidar los permisos
 * la deje cerrada en vez de abierta.
 */
export const Roles = (...roles: readonly RoleCode[]) => SetMetadata(ROLES_KEY, roles);
