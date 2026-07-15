import { Inject, Injectable } from '@nestjs/common';
import {
  EMAIL_ACTION_REPOSITORY,
  IEmailActionRepository,
} from '../../domain/email-action.repository';
import { EmailAction } from '../../domain/email-action.entity';

@Injectable()
export class FindActiveEmailActionUseCase {
  constructor(
    @Inject(EMAIL_ACTION_REPOSITORY)
    private readonly emailActionRepo: IEmailActionRepository,
  ) {}

  execute(): Promise<EmailAction[]> {
    return this.emailActionRepo.findAllActive();
  }
}
