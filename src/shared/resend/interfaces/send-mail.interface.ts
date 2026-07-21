export interface SendMailAttachment {
  filename: string;
  content: Buffer;
}

export interface SendMailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: SendMailAttachment[];
}
