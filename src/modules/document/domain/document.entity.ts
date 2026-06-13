import type { TypeDocument, TypeHired } from './document.enums';

export interface DocumentSponsorItem {
  id: string;
  sponsorId: string;
  sponsor: { id: string; name: string; code: string };
  required: boolean;
  status: boolean;
}

export class Document {
  constructor(
    public readonly id: string,
    public title: string,
    public name: string,
    public type: TypeDocument,
    public formats: string | null,
    public showHired: TypeHired,
    public instructions: string,
    public status: boolean,
    public readonly createdById: string | null,
    public updatedById: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly sponsors: DocumentSponsorItem[],
    public readonly createdBy?: { id: string; username: string | null; email: string | null } | null,
    public readonly updatedBy?: { id: string; username: string | null; email: string | null } | null,
  ) {}
}
