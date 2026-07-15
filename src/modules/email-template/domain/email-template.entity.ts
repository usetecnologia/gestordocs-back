import type { EmailTemplateType, WeekDay } from './email-template.enums';

export interface EmailTemplateSchedule {
  days: WeekDay[];
  time: string;
  timezone: string;
}

export interface EmailActionRef {
  id: string;
  name: string;
  code: string;
}

export interface UserRef {
  id: string;
  username: string | null;
  email: string | null;
}

export class EmailTemplate {
  constructor(
    public readonly id: string,
    public name: string,
    public code: string,
    public subject: string,
    public htmlContent: string,
    public status: boolean,
    public type: EmailTemplateType,
    public actionId: string,
    public schedule: EmailTemplateSchedule | null,
    public readonly createdById: string | null,
    public updatedById: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly action: EmailActionRef,
    public readonly createdBy?: UserRef | null,
    public readonly updatedBy?: UserRef | null,
  ) {}
}
