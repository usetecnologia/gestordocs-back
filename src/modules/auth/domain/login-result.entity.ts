export interface AuthUserSnapshot {
  id: string;
  username: string | null;
  email: string | null;
  role: { id: string; name: string; code: string | null };
  status: string;
}

export class LoginResult {
  constructor(
    public readonly accessToken: string,
    public readonly refreshToken: string,
    public readonly user: AuthUserSnapshot,
  ) {}
}
