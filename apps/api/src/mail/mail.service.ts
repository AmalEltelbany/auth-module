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

  // No name or other user-supplied text: the address isn't verified yet, and
  // whoever signed up with it controls that text.
  sendVerificationCode(to: string, code: string) {
    return this.send(
      to,
      `${code} is your verification code`,
      `Your verification code is:\n\n    ${code}\n\nEnter it in the app to confirm your email. It expires in 10 minutes.\nIf you didn't create an account, ignore this email.`,
    );
  }

  sendPasswordResetCode(to: string, code: string) {
    return this.send(
      to,
      `${code} is your password reset code`,
      `Your password reset code is:\n\n    ${code}\n\nIt expires in 10 minutes. Never share it: we will never ask you for it.\nIf you didn't ask to reset your password, ignore this email; your password hasn't changed.`,
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
