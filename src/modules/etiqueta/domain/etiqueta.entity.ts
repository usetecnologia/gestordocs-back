export class Etiqueta {
  constructor(
    public readonly id: string,
    public name: string,
    public status: boolean,
    public readonly createdById: string | null,
    public updatedById: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly createdBy?: {
      id: string;
      username: string | null;
      email: string | null;
    } | null,
    public readonly updatedBy?: {
      id: string;
      username: string | null;
      email: string | null;
    } | null,
  ) {}
}
