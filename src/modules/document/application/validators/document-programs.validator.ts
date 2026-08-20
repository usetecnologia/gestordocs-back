import { ConflictException } from '@nestjs/common';
import {
  IDocumentRepository,
  DocumentProgramInputData,
  collectTemporadaIds,
  findDuplicateCountryIds,
  findDuplicateProgramIds,
  findInvalidTemporadaAssignments,
} from '../../domain/document.repository';

/**
 * Reglas que create y update comparten sobre el arbol de programas. Vive aparte porque los dos
 * use cases las necesitan identicas: tenerlas duplicadas hacia facil que una se corrigiera en un
 * lado y no en el otro, y que crear y editar el mismo documento aceptaran cosas distintas.
 */
export async function assertProgramsAreValid(
  programs: DocumentProgramInputData[],
  repo: IDocumentRepository,
): Promise<void> {
  if (!programs.length) return;

  const duplicatePrograms = findDuplicateProgramIds(programs);
  if (duplicatePrograms.length > 0) {
    throw new ConflictException(
      `Programa(s) duplicado(s) en la solicitud: ${duplicatePrograms.join(', ')}.`,
    );
  }

  for (const program of programs) {
    const duplicateCountries = findDuplicateCountryIds(program);
    if (duplicateCountries.length > 0) {
      throw new ConflictException(
        `El(los) país(es) ${duplicateCountries.join(', ')} no puede(n) tener más de una descripción para el mismo programa.`,
      );
    }
  }

  // La clave foránea solo garantiza que la temporada exista. Que ademas pertenezca al programa
  // al que se le esta asignando hay que comprobarlo aqui.
  const temporadaIds = collectTemporadaIds(programs);
  if (temporadaIds.length === 0) return;

  const refs = await repo.findTemporadaRefs(temporadaIds);
  const invalid = findInvalidTemporadaAssignments(programs, refs);
  if (invalid.length === 0) return;

  const notFound = invalid.filter((i) => i.reason === 'NOT_FOUND').map((i) => i.temporadaId);
  if (notFound.length > 0) {
    throw new ConflictException(`Temporada(s) inexistente(s): ${notFound.join(', ')}.`);
  }

  const wrongProgram = invalid.map((i) => i.temporadaId);
  throw new ConflictException(
    `La(s) temporada(s) ${wrongProgram.join(', ')} no pertenece(n) al programa al que se está(n) asignando.`,
  );
}
