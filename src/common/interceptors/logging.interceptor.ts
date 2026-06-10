import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import type { Request, Response } from 'express';

function colorMethod(method: string): string {
  const colors: Record<string, string> = {
    GET: '\x1b[32m',
    POST: '\x1b[34m',
    PUT: '\x1b[33m',
    PATCH: '\x1b[33m',
    DELETE: '\x1b[31m',
  };
  const reset = '\x1b[0m';
  const color = colors[method] ?? '\x1b[37m';
  return `${color}${method.padEnd(7)}${reset}`;
}

function colorStatus(status: number): string {
  const reset = '\x1b[0m';
  if (status >= 500) return `\x1b[31m${status}${reset}`;
  if (status >= 400) return `\x1b[33m${status}${reset}`;
  if (status >= 300) return `\x1b[36m${status}${reset}`;
  return `\x1b[32m${status}${reset}`;
}

function colorDuration(ms: number): string {
  const reset = '\x1b[0m';
  if (ms > 1000) return `\x1b[31m${ms}ms${reset}`;
  if (ms > 300) return `\x1b[33m${ms}ms${reset}`;
  return `\x1b[32m${ms}ms${reset}`;
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP', { timestamp: false });

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const { method, originalUrl, ip } = req;
    const userAgent = req.get('user-agent') ?? '';
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const ms = Date.now() - start;
        this.logger.log(
          `${colorMethod(method)} ${originalUrl}  ${colorStatus(res.statusCode)}  ${colorDuration(ms)}  ${ip} "${userAgent}"`,
        );
      }),
      catchError((err: unknown) => {
        const ms = Date.now() - start;
        const status = err instanceof HttpException ? err.getStatus() : 500;
        const msg = err instanceof Error ? err.message : 'Unknown error';
        this.logger.error(
          `${colorMethod(method)} ${originalUrl}  ${colorStatus(status)}  ${colorDuration(ms)}  ✗ ${msg}  ${ip}`,
        );
        return throwError(() => err);
      }),
    );
  }
}
