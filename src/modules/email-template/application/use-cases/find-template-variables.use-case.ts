import { Injectable } from '@nestjs/common';
import {
  TEMPLATE_VARIABLE_DEFINITIONS,
  TemplateVariableDefinition,
} from '@common/utils/template-variables.util';

export interface TemplateVariableItem extends TemplateVariableDefinition {
  token: string;
}

@Injectable()
export class FindTemplateVariablesUseCase {
  execute(): TemplateVariableItem[] {
    return TEMPLATE_VARIABLE_DEFINITIONS.map((v) => ({ ...v, token: `{{${v.key}}}` }));
  }
}
