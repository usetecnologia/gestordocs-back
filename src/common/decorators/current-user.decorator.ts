import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from '@shared/jwt/interfaces/jwt-payload.interface';
import type { Request } from 'express';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    return request.user as JwtPayload;
  },
);
