import { UnsafeSqlError, assertReadOnlySql } from './sql-guard';

const MAX_ROWS = 200;

const guard = (sql: string): string => assertReadOnlySql(sql, MAX_ROWS);

describe('assertReadOnlySql', () => {
  describe('consultas permitidas', () => {
    it('acepta un SELECT con columnas explícitas y respeta su LIMIT', () => {
      const sql =
        'SELECT u.email AS correo FROM `User` u ORDER BY u.created_at DESC LIMIT 5';
      expect(guard(sql)).toBe(sql);
    });

    it('acepta JOINs entre tablas del catálogo', () => {
      const sql =
        'SELECT p.firstname AS nombre, r.name AS rol FROM `User` u JOIN Person p ON p.id = u.id JOIN Role r ON r.id = u.role_id LIMIT 10';
      expect(guard(sql)).toBe(sql);
    });

    it('acepta COUNT(*) sin considerarlo un SELECT *', () => {
      const sql = 'SELECT COUNT(*) AS total FROM `User` LIMIT 1';
      expect(guard(sql)).toBe(sql);
    });

    it('acepta CTEs y reconoce el nombre del CTE como tabla válida', () => {
      const sql =
        'WITH recientes AS (SELECT id, created_at FROM `User` ORDER BY created_at DESC LIMIT 20) SELECT id FROM recientes LIMIT 20';
      expect(guard(sql)).toBe(sql);
    });

    it('acepta correos en literales sin confundirlos con variables de sistema', () => {
      const sql =
        "SELECT u.id FROM `User` u WHERE u.email = 'ana@correo.com' LIMIT 10";
      expect(guard(sql)).toBe(sql);
    });

    it('no confunde OFFSET con la palabra SET ni jo_use_date con USE', () => {
      const sql =
        'SELECT u.jo_use_date AS fecha FROM `User` u ORDER BY u.created_at DESC LIMIT 10 OFFSET 20';
      expect(guard(sql)).toBe(sql);
    });
  });

  describe('límite de filas', () => {
    it('añade LIMIT cuando la consulta no lo trae', () => {
      expect(guard('SELECT id FROM `User`')).toBe(
        `SELECT id FROM \`User\` LIMIT ${MAX_ROWS}`,
      );
    });

    it('recorta un LIMIT que excede el máximo', () => {
      expect(guard('SELECT id FROM `User` LIMIT 5000')).toBe(
        `SELECT id FROM \`User\` LIMIT ${MAX_ROWS}`,
      );
    });

    it('conserva el offset al recortar un LIMIT con desplazamiento', () => {
      expect(guard('SELECT id FROM `User` LIMIT 40, 900')).toBe(
        `SELECT id FROM \`User\` LIMIT 40, ${MAX_ROWS}`,
      );
    });

    it('elimina el punto y coma final', () => {
      expect(guard('SELECT id FROM `User` LIMIT 5;')).toBe(
        'SELECT id FROM `User` LIMIT 5',
      );
    });
  });

  describe('consultas rechazadas', () => {
    it.each([
      ['DELETE FROM `User`'],
      ['UPDATE `User` SET email = NULL'],
      ['INSERT INTO `User` (id) VALUES (1)'],
      ['DROP TABLE `User`'],
      ['TRUNCATE TABLE `User`'],
      ['GRANT ALL ON *.* TO admin'],
    ])('rechaza sentencias de escritura: %s', (sql) => {
      expect(() => guard(sql)).toThrow(UnsafeSqlError);
    });

    it('rechaza sentencias encadenadas', () => {
      expect(() => guard('SELECT id FROM `User`; DROP TABLE `User`')).toThrow(
        UnsafeSqlError,
      );
    });

    it('rechaza comentarios SQL', () => {
      expect(() => guard('SELECT id FROM `User` -- comentario')).toThrow(
        UnsafeSqlError,
      );
    });

    it('rechaza SELECT *', () => {
      expect(() => guard('SELECT * FROM `User` LIMIT 10')).toThrow(
        UnsafeSqlError,
      );
    });

    it('rechaza tablas fuera del catálogo', () => {
      expect(() => guard('SELECT id FROM secretos LIMIT 10')).toThrow(
        UnsafeSqlError,
      );
    });

    it('rechaza nombres calificados con otra base de datos', () => {
      expect(() =>
        guard('SELECT table_name FROM information_schema.tables LIMIT 10'),
      ).toThrow(UnsafeSqlError);
    });

    it('rechaza la columna password aunque venga de una tabla válida', () => {
      expect(() => guard('SELECT u.password FROM `User` u LIMIT 10')).toThrow(
        UnsafeSqlError,
      );
    });

    it('rechaza SELECT ... INTO OUTFILE', () => {
      expect(() =>
        guard("SELECT id INTO OUTFILE '/tmp/x' FROM `User`"),
      ).toThrow(UnsafeSqlError);
    });

    it('rechaza funciones de bloqueo o espera', () => {
      expect(() => guard('SELECT SLEEP(30) AS x FROM `User` LIMIT 1')).toThrow(
        UnsafeSqlError,
      );
    });

    it('rechaza variables de sistema', () => {
      expect(() => guard('SELECT @@version AS v FROM `User` LIMIT 1')).toThrow(
        UnsafeSqlError,
      );
    });

    it('rechaza una consulta vacía', () => {
      expect(() => guard('   ')).toThrow(UnsafeSqlError);
    });
  });
});
