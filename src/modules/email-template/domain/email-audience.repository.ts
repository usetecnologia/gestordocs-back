export interface EmailAudienceRecipient {
  userId: string;
  email: string;
  nombreParticipante: string;
  nombrePrograma: string;
  nombreSponsor: string;
  nombreDocumento: string;
  observacionesUsuario: string;
}

export interface IEmailAudienceRepository {
  findByUserStatus(status: string): Promise<EmailAudienceRecipient[]>;
  findByDocumentStatus(status: string): Promise<EmailAudienceRecipient[]>;
}

export const EMAIL_AUDIENCE_REPOSITORY = Symbol('EMAIL_AUDIENCE_REPOSITORY');
