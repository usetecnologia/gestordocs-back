export class EmailAction {
  constructor(
    public readonly id: string,
    public name: string,
    public code: string,
    public status: boolean,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}
}
