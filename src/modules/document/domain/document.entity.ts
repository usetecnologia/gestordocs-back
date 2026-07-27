import type { TypeDocument, TypeHired } from './document.enums';

export interface DocumentSponsorItem {
  id: string;
  sponsorId: string;
  sponsor: { id: string; name: string; code: string };
  required: boolean;
  order: number;
  status: boolean;
}

export interface DocumentProgramDescriptionCountryItem {
  id: string;
  countryId: string;
  country: { id: string; code: string; name: string };
}

export interface DocumentProgramDescriptionItem {
  id: string;
  title: string;
  description: string;
  order: number;
  countries: DocumentProgramDescriptionCountryItem[];
}

export interface DocumentProgramItem {
  id: string;
  programId: string;
  program: { id: string; code: string; name: string };
  status: boolean;
  descriptions: DocumentProgramDescriptionItem[];
}

export class Document {
  constructor(
    public readonly id: string,
    public title: string | null,
    public name: string,
    public type: TypeDocument,
    public formats: string | null,
    public showHired: TypeHired,
    public siglasCode: string | null,
    public order: number | null,
    public instructions: string | null,
    public required: boolean,
    public status: boolean,
    public readonly createdById: string | null,
    public updatedById: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly sponsors: DocumentSponsorItem[],
    public readonly programs: DocumentProgramItem[],
    public readonly createdBy?: { id: string; username: string | null; email: string | null } | null,
    public readonly updatedBy?: { id: string; username: string | null; email: string | null } | null,
  ) {}
}
