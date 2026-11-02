import { Injectable, Logger } from '@nestjs/common';

export interface MailMessage {
  to: string;
  kind: 'invite' | 'password_reset' | 'member_added';
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export const MAILER = Symbol('MAILER');

/**
 * Development/test transport: keeps messages in memory (tests read them) and logs only that a message was
 * queued — never the recipient address or the link, which contains a secret token. Production startup is
 * refused while this is the only transport (config.ts), because invitations would be silently dropped.
 */
@Injectable()
export class LogMailer implements Mailer {
  private readonly logger = new Logger('LogMailer');
  readonly outbox: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.outbox.push(message);
    if (this.outbox.length > 200) this.outbox.shift();
    this.logger.log(`mail queued (kind=${message.kind}, transport=log)`);
  }

  /** Most recent message to `to` (test helper). */
  lastTo(to: string): MailMessage | undefined {
    return [...this.outbox].reverse().find((m) => m.to === to);
  }
}
