export class OptionProgram {
  constructor(
    public readonly id: string,
    public name: string,
    public shortName: string,
    public shortDatabase: string,
    public countryId: string,
    public programId: string,
    public sponsorId: string,
    public status: boolean,
    public hideJobFair: boolean,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly country?: { id: string; name: string; code: string } | null,
    public readonly program?: { id: string; name: string; code: string } | null,
    public readonly sponsor?: { id: string; name: string; code: string } | null,
  ) {}
}
