import { ConflictException } from '@nestjs/common';
import { assertProgramsAreValid } from './document-programs.validator';
import type {
  DocumentProgramInputData,
  IDocumentRepository,
  TemporadaProgramRef,
} from '../../domain/document.repository';

/**
 * La clave foránea de `temporada_id` solo garantiza que la temporada exista: nada a nivel de
 * base de datos impide asignarle a "WAT USA" una temporada que pertenece a "Internship USA".
 * Esa comprobación vive aquí y es la única que la evita.
 */

const WAT = 'programa-wat';
const INTERNSHIP = 'programa-internship';

function repoConTemporadas(refs: TemporadaProgramRef[]) {
  const findTemporadaRefs = jest.fn().mockResolvedValue(refs);
  return { repo: { findTemporadaRefs } as unknown as IDocumentRepository, findTemporadaRefs };
}

function programa(partial: Partial<DocumentProgramInputData> = {}): DocumentProgramInputData {
  return { programId: WAT, descriptions: [], ...partial };
}

describe('assertProgramsAreValid — temporadas', () => {
  it('acepta una temporada que pertenece al programa al que se asigna', async () => {
    const { repo } = repoConTemporadas([{ id: 't-verano', programId: WAT }]);

    await expect(
      assertProgramsAreValid([programa({ temporadaId: 't-verano' })], repo),
    ).resolves.toBeUndefined();
  });

  it('rechaza una temporada que pertenece a otro programa', async () => {
    const { repo } = repoConTemporadas([{ id: 't-verano', programId: INTERNSHIP }]);

    await expect(
      assertProgramsAreValid([programa({ temporadaId: 't-verano' })], repo),
    ).rejects.toThrow(ConflictException);
  });

  it('rechaza una temporada inexistente indicando que no existe', async () => {
    const { repo } = repoConTemporadas([]);

    await expect(
      assertProgramsAreValid([programa({ temporadaId: 't-fantasma' })], repo),
    ).rejects.toThrow(/inexistente/i);
  });

  it('no consulta temporadas cuando ningún programa trae una asignada', async () => {
    const { repo, findTemporadaRefs } = repoConTemporadas([]);

    await assertProgramsAreValid([programa(), programa({ programId: INTERNSHIP })], repo);

    expect(findTemporadaRefs).not.toHaveBeenCalled();
  });

  it('consulta cada temporada una sola vez aunque se repita entre programas', async () => {
    const { repo, findTemporadaRefs } = repoConTemporadas([{ id: 't-verano', programId: WAT }]);

    // Mismo id de temporada en dos programas distintos: el segundo debe fallar por no
    // pertenecerle, pero la consulta se hace con la lista deduplicada.
    await expect(
      assertProgramsAreValid(
        [
          programa({ temporadaId: 't-verano' }),
          programa({ programId: INTERNSHIP, temporadaId: 't-verano' }),
        ],
        repo,
      ),
    ).rejects.toThrow(ConflictException);

    expect(findTemporadaRefs).toHaveBeenCalledWith(['t-verano']);
  });

  it('sigue rechazando programas duplicados antes de mirar las temporadas', async () => {
    const { repo, findTemporadaRefs } = repoConTemporadas([]);

    await expect(
      assertProgramsAreValid(
        [programa({ temporadaId: 't-verano' }), programa({ temporadaId: 't-verano' })],
        repo,
      ),
    ).rejects.toThrow(/duplicado/i);

    expect(findTemporadaRefs).not.toHaveBeenCalled();
  });
});
