import { Injectable } from '@nestjs/common';
import { DocumentAiProfile } from '../../domain/document.enums';
import {
  ADDITIONAL_INSTRUCTIONS_PREFIX,
  PASSPORT_BASE_PROMPT,
} from '../../domain/ai/passport-prompt';

export interface DocumentAiPromptResult {
  perfil: DocumentAiProfile;
  promptBase: string;
  encabezadoInstrucciones: string;
}

const BASE_PROMPTS: Record<DocumentAiProfile, string> = {
  [DocumentAiProfile.PASSPORT]: PASSPORT_BASE_PROMPT,
};

/** Prompt base de un perfil, para mostrarlo en el formulario tal como lo recibe la IA. */
@Injectable()
export class FindDocumentAiPromptUseCase {
  execute(profile: DocumentAiProfile): DocumentAiPromptResult {
    return {
      perfil: profile,
      promptBase: BASE_PROMPTS[profile],
      encabezadoInstrucciones: ADDITIONAL_INSTRUCTIONS_PREFIX,
    };
  }
}
