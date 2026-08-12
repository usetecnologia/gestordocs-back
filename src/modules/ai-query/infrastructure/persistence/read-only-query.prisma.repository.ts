import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from 'prisma/generated/prisma/client';
import { envs } from '@config/envs';
import { IReadOnlyQueryPort } from '../../domain/read-only-query.port';

/**
 * Conexión dedicada a las consultas generadas por IA.
 *
 * Va aparte del PrismaService de la aplicación por dos motivos: usa credenciales de solo lectura
 * cuando el despliegue las define (READONLY_USER_DB / READONLY_PASSWORD_DB), lo que convierte la
 * restricción "solo SELECT" en una garantía del motor y no solo del validador; y tiene un pool
 * pequeño, para que una consulta pesada no agote las conexiones del resto de la API.
 */
@Injectable()
export class ReadOnlyQueryPrismaRepository
  implements IReadOnlyQueryPort, OnModuleDestroy
{
  private readonly client: PrismaClient;

  constructor() {
    const adapter = new PrismaMariaDb({
      host: envs.HOST_DB,
      user: envs.READONLY_USER_DB ?? envs.USER_DB,
      password: envs.READONLY_PASSWORD_DB ?? envs.PASSWORD_DB,
      database: envs.DATABASE_DB,
      port: envs.PORT_DB,
      connectionLimit: 3,
    });
    this.client = new PrismaClient({ adapter });
  }

  async run(
    sql: string,
    timeoutMs: number,
  ): Promise<Record<string, unknown>[]> {
    const query = this.client.$queryRawUnsafe<Record<string, unknown>[]>(sql);

    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(
              `La consulta superó el tiempo máximo de ${timeoutMs / 1000}s.`,
            ),
          ),
        timeoutMs,
      );
    });

    try {
      return await Promise.race([query, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
