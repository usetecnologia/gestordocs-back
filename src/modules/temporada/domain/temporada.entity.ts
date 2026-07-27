export class Temporada {
  constructor(
    public readonly id: string,
    public programId: string,
    public name: string,
    public status: boolean,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly program?: { id: string; name: string; code: string } | null,
  ) {}
}
