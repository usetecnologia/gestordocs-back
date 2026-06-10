export class Country {
  constructor(
    public readonly id: string,
    public code: string,
    public name: string,
    public currency: string | null,
    public countryCode: string | null,
    public status: boolean,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}
}
