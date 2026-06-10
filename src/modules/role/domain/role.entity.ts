export class Role {
  constructor(
    public readonly id: string,
    public name: string,
    public code: string | null,
    public description: string | null,
    public isSystem: boolean,
    public status: boolean,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}
}
