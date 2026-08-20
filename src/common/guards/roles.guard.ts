import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '@common/decorators/public.decorator';
import { ROLES_KEY } from '@common/decorators/roles.decorator';
import type { RoleCode } from '@common/enums/role-code.enum';
import type { JwtPayload } from '@shared/jwt/interfaces/jwt-payload.interface';

type AuthenticatedRequest = Request & { user?: JwtPayload };

/**
 * Autorización por rol. Se declara SIEMPRE después de `JwtAuthGuard`, que es quien resuelve el
 * token y deja el payload en `request.user`:
 *
 *     @UseGuards(JwtAuthGuard, RolesGuard)
 *
 * Deniega por defecto: si el handler no tiene `@Roles(...)`, nadie pasa. Es deliberado — hasta
 * ahora el único guard del proyecto era el de autenticación, así que cualquier usuario con token
 * podía llamar a cualquier endpoint, incluido un participante aprobando sus propios documentos.
 * Con una allowlist explícita, agregar un endpoint y olvidar los permisos lo deja cerrado y se
 * nota en la primera prueba, en lugar de quedar abierto sin que nadie lo advierta.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const allowedRoles = this.reflector.getAllAndOverride<readonly RoleCode[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!allowedRoles?.length) {
      throw new ForbiddenException(
        'Este recurso no declara los roles que pueden acceder a él.',
      );
    }

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user) throw new UnauthorizedException('Token no proporcionado.');

    if (!allowedRoles.includes(user.role as RoleCode)) {
      throw new ForbiddenException('No tienes permisos para realizar esta acción.');
    }

    return true;
  }
}
