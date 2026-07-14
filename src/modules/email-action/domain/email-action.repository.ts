import { EmailAction } from './email-action.entity';

export interface IEmailActionRepository {
  findAllActive(): Promise<EmailAction[]>;
  findById(id: string): Promise<EmailAction | null>;
  findActiveByCode(code: string): Promise<EmailAction | null>;
}

export const EMAIL_ACTION_REPOSITORY = Symbol('EMAIL_ACTION_REPOSITORY');
