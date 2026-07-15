import { UserStatus } from './user.enums';

export interface UserObservation {
  id: string;
  observation: string;
  status: boolean;
  endDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdById: string | null;
  createdBy: { id: string; fullName: string } | null;
  etiquetas: { id: string; name: string }[];
  files: { id: string; file: string }[];
}

export interface UserHistoryStatusItem {
  id: string;
  status: string;
  createdById: string | null;
  createdBy: { id: string; fullName: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserEmailLogItem {
  id: string;
  actionCode: string;
  templateCode: string | null;
  subject: string | null;
  status: string;
  source: string;
  errorMessage: string | null;
  sentAt: Date;
}

export class User {
  constructor(
    public readonly id: string,
    public firstname: string,
    public middlename: string | null,
    public lastfathername: string,
    public lastmothername: string | null,
    public birthdate: string | null,
    public phone: string | null,
    public avatar: string | null,
    public username: string | null,
    public email: string | null,
    public readonly password: string | null,
    public roleId: string,
    public countryId: string | null,
    public sponsorId: string | null,
    public programId: string | null,
    public optionProgramId: string | null,
    public status: UserStatus,
    public statusSolRetiro: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly role?: { id: string; name: string; code: string | null } | null,
    public readonly country?: { id: string; name: string; code: string } | null,
    public readonly sponsor?: { id: string; name: string; code: string } | null,
    public readonly program?: { id: string; name: string; code: string } | null,
    public readonly optionProgram?: { id: string; name: string; shortName: string } | null,
    public readonly observations?: UserObservation[] | null,
    public readonly historyStatus?: UserHistoryStatusItem[] | null,
    public readonly emailHistory?: UserEmailLogItem[] | null,
  ) {}
}
