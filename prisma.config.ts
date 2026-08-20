import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * El CLI de Prisma (migrate, diff) necesita una URL de conexión; la aplicación en runtime no la
 * usa, porque se conecta por el driver adapter con HOST_DB / USER_DB / PASSWORD_DB / DATABASE_DB.
 *
 * La URL se arma con esas mismas variables en vez de exigir una DATABASE_URL aparte: así cualquier
 * entorno donde la aplicación ya levanta puede correr `prisma migrate deploy` sin configuración
 * adicional. Sin esto, el contenedor de producción — que no define DATABASE_URL — fallaría al
 * arrancar. Si DATABASE_URL está definida, tiene prioridad.
 */
function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const user = encodeURIComponent(process.env.USER_DB ?? '');
  const password = encodeURIComponent(process.env.PASSWORD_DB ?? '');
  const host = process.env.HOST_DB ?? 'localhost';
  const port = process.env.PORT_DB ?? '3306';
  const database = process.env.DATABASE_DB ?? '';

  return `mysql://${user}:${password}@${host}:${port}/${database}`;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: databaseUrl(),
  },
});
