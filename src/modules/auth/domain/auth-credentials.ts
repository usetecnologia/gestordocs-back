export interface AuthPersonData {
  firstname: string;
  middlename: string | null;
  lastfathername: string;
  lastmothername: string | null;
  phone: string | null;
  avatar: string | null;
  dni: string | null;
}

export interface AuthCredentials {
  id: string;
  username: string | null;
  email: string | null;
  passwordHash: string | null;
  role: { id: string; name: string; code: string | null };
  status: string;
  person: AuthPersonData | null;
  country?: { id: string; name: string; code: string } | null;
  program?: { id: string; name: string; code: string } | null;
  sponsor?: { id: string; name: string; code: string } | null;
  optionProgram?: { id: string; name: string; shortName: string } | null;
}
