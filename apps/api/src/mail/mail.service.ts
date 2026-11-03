import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { config } from '../config.js';

// Plain-text transactional mail. Callers own the links; this service only sends.
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  private readonly transport = config.SMTP_HOST
    ? nodemailer.createTransport({
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        secure: config.SMTP_PORT === 465,
        auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
      })
    : // ponytail: no SMTP outside production → the message is logged; config forbids this in production
      nodemailer.createTransport({ jsonTransport: true });

  sendVerification(to: string, name: string, link: string) {
    return this.send(
      to,
      'Confirm your email',
      `Hi ${name},\n\nConfirm your email address by opening this link:\n\n${link}\n\nIt expires in 24 hours. If you didn't create an account, ignore this email.`,
    );
  }

  sendPasswordReset(to: string, link: string) {
    return this.send(
      to,
      'Reset your password',
      `Someone asked to reset the password for this account.\n\nChoose a new password here:\n\n${link}\n\nIt expires in 30 minutes. If it wasn't you, ignore this email: your password hasn't changed.`,
    );
  }

  sendPasswordChanged(to: string) {
    return this.send(
      to,
      'Your password was changed',
      `Your password was just changed and every device was signed out.\n\nIf this wasn't you, reset your password right away.`,
    );
  }

  private async send(to: string, subject: string, text: string): Promise<void> {
    await this.transport.sendMail({ from: config.MAIL_FROM, to, subject, text });
    if (!config.SMTP_HOST) this.logger.log(`[dev mail, not sent] To: ${to} | ${subject}\n${text}`);
  }
}
