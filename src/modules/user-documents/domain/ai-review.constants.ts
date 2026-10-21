/** Usuario de sistema a cuyo nombre la IA registra lo que hace (ver prisma/seed-ai-reviewer.ts). */
export const AI_REVIEWER_USERNAME = 'revision-ia';

/**
 * Etiqueta con la que se marcan las observaciones de la IA. Se busca por nombre y no por id:
 * el id cambia entre bases (en testdocs no es el mismo que en producción).
 */
export const AI_OBSERVATION_LABEL_NAME = 'Observado por IA';
