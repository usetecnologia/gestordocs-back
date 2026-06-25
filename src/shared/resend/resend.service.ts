import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import type { CreateEmailOptions } from 'resend';
import { envs } from '@config/envs';
import type { SendMailOptions } from './interfaces/send-mail.interface';

@Injectable()
export class ResendService {
  private readonly logger = new Logger(ResendService.name);
  private readonly client: Resend;

  constructor() {
    this.client = new Resend(envs.RESEND_API_KEY);
  }

  async sendMail({ to, subject, html, text }: SendMailOptions): Promise<void> {
    const base = {
      from: envs.MAIL_FROM,
      to: Array.isArray(to) ? to : [to],
      subject,
    };

    const payload: CreateEmailOptions = html
      ? { ...base, html }
      : { ...base, text: text ?? '' };

    const { error } = await this.client.emails.send(payload);

    if (error) {
      this.logger.error(`Error al enviar correo a ${JSON.stringify(to)}: ${error.message}`);
      throw new InternalServerErrorException('No se pudo enviar el correo electrónico.');
    }
  }

  async notifyAdmin(subject: string, text: string): Promise<void> {
    await this.sendMail({ to: envs.ADMIN_EMAIL, subject, text });
  }
}
