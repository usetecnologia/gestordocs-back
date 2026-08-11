import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

/**
 * Inspección SOLO LECTURA: estado de UserDocumentHistory.observation en producción.
 * Sirve para decidir cómo aplicar la migración varchar(191) → TEXT (fix 3 del incidente).
 */

const adapter = new PrismaMariaDb({
  host: process.env.HOST_DB!,
  user: process.env.USER_DB!,
  password: process.env.PASSWORD_DB!,
  database: process.env.DATABASE_DB!,
  port: Number(process.env.PORT_DB ?? 3306),
});
const prisma = new PrismaClient({ adapter });

const num = (v: bigint | number | null) => Number(v ?? 0);

async function main() {
  const version = await prisma.$queryRaw<{ v: string }[]>`SELECT VERSION() AS v`;
  console.log('=== Motor ===');
  console.log(version[0]?.v);

  const cols = await prisma.$queryRaw<
    {
      COLUMN_NAME: string;
      COLUMN_TYPE: string;
      IS_NULLABLE: string;
      CHARACTER_MAXIMUM_LENGTH: bigint | null;
      CHARACTER_SET_NAME: string | null;
      COLLATION_NAME: string | null;
    }[]
  >`
    SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH,
           CHARACTER_SET_NAME, COLLATION_NAME
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'UserDocumentHistory'
    ORDER BY ORDINAL_POSITION
  `;
  console.log('\n=== Columnas reales de UserDocumentHistory ===');
  console.table(
    cols.map((c) => ({
      ...c,
      CHARACTER_MAXIMUM_LENGTH: num(c.CHARACTER_MAXIMUM_LENGTH),
    })),
  );

  const size = await prisma.$queryRaw<
    { TABLE_ROWS: bigint | null; DATA_MB: number | null; INDEX_MB: number | null; ENGINE: string }[]
  >`
    SELECT TABLE_ROWS,
           ROUND(DATA_LENGTH  / 1024 / 1024, 2) AS DATA_MB,
           ROUND(INDEX_LENGTH / 1024 / 1024, 2) AS INDEX_MB,
           ENGINE
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'UserDocumentHistory'
  `;
  console.log('\n=== Tamaño de la tabla (estimado por information_schema) ===');
  console.table(size.map((s) => ({ ...s, TABLE_ROWS: num(s.TABLE_ROWS) })));

  const stats = await prisma.$queryRaw<
    {
      filas: bigint;
      con_observacion: bigint;
      max_chars: bigint | null;
      max_bytes: bigint | null;
      en_el_limite_191: bigint;
      sobre_150: bigint;
    }[]
  >`
    SELECT COUNT(*)                                                      AS filas,
           SUM(observation IS NOT NULL)                                  AS con_observacion,
           MAX(CHAR_LENGTH(observation))                                 AS max_chars,
           MAX(LENGTH(observation))                                      AS max_bytes,
           SUM(CHAR_LENGTH(observation) = 191)                           AS en_el_limite_191,
           SUM(CHAR_LENGTH(observation) > 150)                           AS sobre_150
    FROM UserDocumentHistory
  `;
  console.log('\n=== Contenido actual de observation ===');
  console.table(
    stats.map((s) => ({
      filas: num(s.filas),
      con_observacion: num(s.con_observacion),
      max_chars: num(s.max_chars),
      max_bytes: num(s.max_bytes),
      en_el_limite_191: num(s.en_el_limite_191),
      sobre_150: num(s.sobre_150),
    })),
  );

  const migraciones = await prisma.$queryRaw<
    { migration_name: string; finished_at: Date | null; applied_steps_count: number }[]
  >`
    SELECT migration_name, finished_at, applied_steps_count
    FROM _prisma_migrations
    ORDER BY started_at DESC
    LIMIT 5
  `;
  console.log('\n=== Últimas migraciones registradas en producción ===');
  console.table(migraciones);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
