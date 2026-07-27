export interface ProgramTemporada {
  id: string;
  name: string;
  status: boolean;
}

export class Program {
  constructor(
    public readonly id: string,
    public idExterno: string | null,
    public code: string,
    public name: string,
    public status: boolean,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly temporadas: ProgramTemporada[] = [],
  ) {}
}
