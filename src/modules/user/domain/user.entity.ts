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
    public fechadeenvioalsponsor: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly role?: { id: string; name: string; code: string | null } | null,
    public readonly country?: { id: string; name: string; code: string } | null,
    public readonly sponsor?: { id: string; name: string; code: string } | null,
    public readonly program?: { id: string; name: string; code: string } | null,
    public readonly optionProgram?: { id: string; shortDatabase: string } | null,
    /**
     * Proceso que el participante ve. Va en los listados para que la pantalla de USE sepa qué
     * acción ofrecerle: continuar solo tiene sentido sobre un ciclo `FINALIZADO`, y finalizar solo
     * sobre uno `EN_PROCESO`. Sin este dato la pantalla tendría que ofrecer las dos siempre y
     * dejar que el backend rechace la que no aplica.
     */
    public readonly procesoVisible?: {
      id: string;
      estado: string;
      fechaIngreso: Date;
    } | null,
    public readonly observations?: UserObservation[] | null,
    public readonly historyStatus?: UserHistoryStatusItem[] | null,
    public readonly emailHistory?: UserEmailLogItem[] | null,
    /**
     * Ciclo **de esta fila**. En el listado de participantes cada fila es un proceso, así que un
     * participante con dos ciclos aparece dos veces y cada aparición trae el suyo: su estado, su
     * avance documental y sus dimensiones, que pueden diferir entre ciclos.
     *
     * En el detalle es el ciclo que se está mirando. Cuando coincide con `procesoVisible` es el
     * ciclo en curso; cuando no, se está viendo uno archivado y no admite acciones.
     *
     * Va al final del constructor a propósito: son 29 argumentos posicionales y meter uno en medio
     * desalinea todo lo que sigue.
     */
    public readonly proceso?: {
      id: string;
      estado: string;
      statusDocumental: string;
      fechaIngreso: Date;
      finalizadoAt: Date | null;
      esVisible: boolean;
    } | null,
  ) {}
}
