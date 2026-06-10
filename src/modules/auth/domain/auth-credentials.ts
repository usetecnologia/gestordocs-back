export interface AuthCredentials {
  id: string;
  username: string | null;
  email: string | null;
  passwordHash: string | null;
  role: { id: string; name: string; code: string | null };
  status: string;
}
