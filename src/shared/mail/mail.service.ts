import { Injectable, OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { envs } from '@config/envs';
import type { SendMailOptions } from './interfaces/send-mail.interface';

@Injectable()
export class MailService implements OnModuleInit {
  private transporter!: nodemailer.Transporter;

  onModuleInit() {
    this.transporter = nodemailer.createTransport({
      host: envs.MAIL_HOST,
      port: envs.MAIL_PORT,
      secure: envs.MAIL_PORT === 465,
      auth: { user: envs.MAIL_USER, pass: envs.MAIL_PASS },
    });
  }

  async sendMail(options: SendMailOptions): Promise<void> {
    await this.transporter.sendMail({
      from: envs.MAIL_USER,
      ...options,
    });
  }

  async notifyAdmin(subject: string, text: string): Promise<void> {
    await this.sendMail({ to: envs.ADMIN_EMAIL, subject, text });
  }
}
