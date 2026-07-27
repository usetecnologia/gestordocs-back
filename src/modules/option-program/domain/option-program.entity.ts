export class OptionProgram {
  constructor(
    public readonly id: string,
    public shortDatabase: string,
    public programId: string,
    public status: boolean,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly program?: { id: string; name: string; code: string } | null,
  ) {}
}
