import type { AuthPersonData } from './auth-credentials';

export interface AuthUserSnapshot {
  id: string;
  username: string | null;
  email: string | null;
  role: { id: string; name: string; code: string | null };
  status: string;
  person: AuthPersonData | null;
  country?: { id: string; name: string; code: string } | null;
  program?: { id: string; name: string; code: string } | null;
  sponsor?: { id: string; name: string; code: string } | null;
  optionProgram?: { id: string; name: string; shortName: string } | null;
}

export class LoginResult {
  constructor(
    public readonly accessToken: string,
    public readonly refreshToken: string,
    public readonly user: AuthUserSnapshot,
  ) {}
}
