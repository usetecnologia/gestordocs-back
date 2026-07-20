export interface WorkuseParticipant {
  valid: boolean;
  dni: string;
  firstname: string;
  middlename?: string;
  lastfathername: string;
  lastmothername?: string;
  birthdate?: string | null;
  country: string;
  countryId?: string;
  program: string;
  programId?: string;
  sponsor: string;
  sponsorId?: string;
  optionPrograma: string;
  optionProgramId?: string;
  optionProgramBD?: string;
  status?: string;
  employer?: string;
  status_hired?: number | null;
  hired_date?: string | null;
  jo_use_date?: string | null;
  programAgreementOK?: boolean | null;
  fechadeenvioalsponsor?: string | null;
  fechaDSinUSE?: string | null;
  statusSolRetiro?: string | null;
  database_year?: string;
  email?: string;
}
