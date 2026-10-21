import { BadRequestException } from '@nestjs/common';
import { DocumentAiProfile, TypeDocument } from '../../domain/document.enums';

export interface DocumentAiConfigState {
  type: TypeDocument;
  aiEnabled: boolean;
  aiProfile: DocumentAiProfile | null;
}

/**
 * Con la IA activa el documento tiene que tener un perfil (si no, no hay qué extraer) y tiene que
 * ser de tipo DOCUMENT: uno INFORMATIVE no lleva archivo. Se valida sobre el estado resultante,
 * no sobre la solicitud, porque un PATCH parcial puede cambiar solo el tipo de un documento que
 * ya tenía la IA encendida.
 */
export function assertAiConfigIsValid(state: DocumentAiConfigState): void {
  if (!state.aiEnabled) return;

  if (state.type === TypeDocument.INFORMATIVE) {
    throw new BadRequestException(
      'La revisión con IA solo aplica a documentos de tipo DOCUMENT: uno informativo no lleva archivo.',
    );
  }
  if (!state.aiProfile) {
    throw new BadRequestException('Selecciona qué debe extraer la IA (aiProfile) para activarla.');
  }
}
