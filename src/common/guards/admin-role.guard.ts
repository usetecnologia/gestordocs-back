import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPayload } from '@shared/jwt/interfaces/jwt-payload.interface';

export const ADMIN_ROLE_CODE = 'ADMIN';

/**
 * Restringe el endpoint al rol ADMIN. Debe ejecutarse SIEMPRE después de JwtAuthGuard,
 * que es quien deja el payload del token en request['user'].
 */
@Injectable()
export class AdminRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();
    const user = request.user;

    if (user?.role !== ADMIN_ROLE_CODE) {
      throw new ForbiddenException(
        'Esta operación solo está disponible para administradores.',
      );
    }

    return true;
  }
}
