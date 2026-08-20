import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { IS_PUBLIC_KEY } from '@common/decorators/public.decorator';
import { ROLES_KEY } from '@common/decorators/roles.decorator';
import { RoleCode, STAFF_ROLES } from '@common/enums/role-code.enum';
import type { JwtPayload } from '@shared/jwt/interfaces/jwt-payload.interface';

/**
 * Hasta este guard, el único control del proyecto era el de autenticación: cualquier usuario con
 * token válido —un participante incluido— podía aprobar sus propios documentos. Los casos de abajo
 * fijan ese comportamiento para que no se pierda.
 */

function contexto(user?: Partial<JwtPayload>): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

/** Reflector que responde con los metadatos indicados, sin depender de decoradores reales. */
function reflectorCon(metadata: Record<string, unknown>): Reflector {
  return {
    getAllAndOverride: (key: string) => metadata[key],
  } as unknown as Reflector;
}

function guardCon(metadata: Record<string, unknown>): RolesGuard {
  return new RolesGuard(reflectorCon(metadata));
}

describe('RolesGuard', () => {
  it('deja pasar al rol declarado', () => {
    const guard = guardCon({ [ROLES_KEY]: STAFF_ROLES });
    expect(guard.canActivate(contexto({ role: RoleCode.ASESOR }))).toBe(true);
  });

  it('bloquea al participante en un endpoint solo de staff', () => {
    const guard = guardCon({ [ROLES_KEY]: STAFF_ROLES });
    expect(() => guard.canActivate(contexto({ role: RoleCode.PARTICIPANTE }))).toThrow(
      ForbiddenException,
    );
  });

  it('deniega cuando el handler no declara roles — allowlist explícita', () => {
    // Un endpoint nuevo sin @Roles queda cerrado. Si el guard permitiera por defecto, olvidarse
    // del decorador dejaria el endpoint abierto a cualquiera y nadie se enteraria.
    const guard = guardCon({});
    expect(() => guard.canActivate(contexto({ role: RoleCode.ADMIN }))).toThrow(ForbiddenException);
  });

  it('deniega cuando @Roles se declara vacío', () => {
    const guard = guardCon({ [ROLES_KEY]: [] });
    expect(() => guard.canActivate(contexto({ role: RoleCode.ADMIN }))).toThrow(ForbiddenException);
  });

  it('respeta @Public sin exigir rol ni usuario', () => {
    const guard = guardCon({ [IS_PUBLIC_KEY]: true });
    expect(guard.canActivate(contexto(undefined))).toBe(true);
  });

  it('exige usuario autenticado aunque el endpoint declare roles', () => {
    const guard = guardCon({ [ROLES_KEY]: STAFF_ROLES });
    expect(() => guard.canActivate(contexto(undefined))).toThrow(UnauthorizedException);
  });

  it('no confunde un rol desconocido con uno permitido', () => {
    const guard = guardCon({ [ROLES_KEY]: STAFF_ROLES });
    expect(() => guard.canActivate(contexto({ role: 'Administrador' }))).toThrow(
      ForbiddenException,
    );
  });

  it('los tres roles internos de USE son staff; el participante no', () => {
    const guard = guardCon({ [ROLES_KEY]: STAFF_ROLES });
    for (const role of [RoleCode.ADMIN, RoleCode.SUPERVISOR, RoleCode.ASESOR]) {
      expect(guard.canActivate(contexto({ role }))).toBe(true);
    }
    expect(() => guard.canActivate(contexto({ role: RoleCode.PARTICIPANTE }))).toThrow(
      ForbiddenException,
    );
  });
});
