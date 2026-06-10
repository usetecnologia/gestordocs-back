import { UserStatus } from './user.enums';

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
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly role?: { id: string; name: string; code: string | null } | null,
    public readonly country?: { id: string; name: string; code: string } | null,
    public readonly sponsor?: { id: string; name: string; code: string } | null,
    public readonly program?: { id: string; name: string; code: string } | null,
    public readonly optionProgram?: { id: string; name: string; shortName: string } | null,
  ) {}
}
