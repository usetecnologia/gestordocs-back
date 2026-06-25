export interface SendMailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
}
