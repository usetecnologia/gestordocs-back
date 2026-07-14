import type { EmailAction as PrismaEmailAction } from 'prisma/generated/prisma/client';
import { EmailAction } from '../../domain/email-action.entity';

export class EmailActionMapper {
  static toDomain(raw: PrismaEmailAction): EmailAction {
    return new EmailAction(raw.id, raw.name, raw.code, raw.status, raw.createdAt, raw.updatedAt);
  }
}
