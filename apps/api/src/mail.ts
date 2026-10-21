import nodemailer from 'nodemailer';
import { randomUUID } from 'node:crypto';
import type { ApiConfig } from './config.js';

export interface MailMessage { id: string; to: string; subject: string; text: string; createdAt: string }
export class Mailer {
  readonly messages: MailMessage[] = [];
  private readonly transport;
  constructor(private config: ApiConfig) {
    this.transport = config.smtpHost ? nodemailer.createTransport({
      host: config.smtpHost, port: config.smtpPort, secure: config.smtpPort === 465,
      auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPassword } : undefined,
    }) : undefined;
  }
  async send(to: string, kind: 'verify' | 'reset', token: string) {
    const link = `${this.config.webOrigin}/?${kind}=${encodeURIComponent(token)}`;
    const subject = kind === 'verify' ? 'Confirme sua conta no B.A.R.' : 'Redefina sua senha no B.A.R.';
    const text = `${subject}\n\n${link}\n\nO link expira em ${kind === 'verify' ? '24 horas' : '30 minutos'}. Se não solicitou, ignore esta mensagem.`;
    if (this.transport) await this.transport.sendMail({ from: this.config.mailFrom, to, subject, text });
    if (this.config.mailEnabled) {
      this.messages.unshift({ id: randomUUID(), to, subject, text, createdAt: new Date().toISOString() });
      this.messages.splice(100);
    }
    if (!this.transport && !this.config.mailEnabled) throw new Error('Entrega de e-mail não configurada.');
  }
  close() { this.transport?.close(); }
}
