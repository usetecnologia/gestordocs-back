export interface WorkuseCountry {
  id: number;
  code: string;
  name: string;
}

export interface WorkuseProgram {
  id: number;
  short: string;
  /** May contain HTML tags (e.g. <b>Work and Travel USA</b>) */
  name: string;
}

export interface WorkuseOptionProgram {
  id: number;
  short: string;
  short_Database: string;
  description: string;
  countryId: number;
  programId: number;
}

export interface WorkuseSponsor {
  id: number;
  name: string;
}

export interface WorkuseGenericsResponse {
  countries: WorkuseCountry[];
  programs: WorkuseProgram[];
  optionPrograms: WorkuseOptionProgram[];
  sponsor: WorkuseSponsor[];
}

export interface IWorkuseGenericPort {
  fetchGenerics(): Promise<WorkuseGenericsResponse>;
}

export const WORKUSE_GENERIC_PORT = Symbol('WORKUSE_GENERIC_PORT');
