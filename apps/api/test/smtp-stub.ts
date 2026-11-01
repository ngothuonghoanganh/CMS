import { createServer, type Server, type Socket } from 'node:net';
import { type ConfirmationLink, confirmationLinkIn } from './recipients.js';

/**
 * How the stub behaves towards the next connections:
 * - `accept`: takes every message;
 * - `silent`: takes the connection and never greets (a greeting timeout);
 * - `stall`: greets and takes the envelope, then never answers DATA (a socket timeout).
 */
export type SmtpStubMode = 'accept' | 'silent' | 'stall';

/** A message the stub took. */
export interface StubMessage {
  to: string[];
  /** The message as sent after DATA, headers included. */
  data: string;
}

/**
 * A tiny SMTP server on 127.0.0.1 that fails the way real servers do, so `SmtpEmailSender` meets
 * real nodemailer errors: no server at all (`stop`), a server that never answers, and a 550 for
 * some recipients while it takes the others (`refuse`). Mailpit accepts everything, so it cannot
 * show these. Listens on a port the system picks; `restart` takes the same one again.
 */
export class SmtpStub {
  mode: SmtpStubMode = 'accept';
  readonly messages: StubMessage[] = [];
  /** Connections opened since the start, including refused and stalled ones. */
  connections = 0;
  private readonly refused = new Set<string>();
  private readonly sockets = new Set<Socket>();
  private server: Server | null = null;

  private constructor(private port: number) {}

  static async start(): Promise<SmtpStub> {
    const stub = new SmtpStub(0);
    await stub.listen();
    return stub;
  }

  /** `SMTP_URL` for this stub; `options` go in the query, where nodemailer reads them too. */
  url(options: Record<string, number> = {}): string {
    const query = new URLSearchParams(
      Object.entries(options).map(([name, value]): [string, string] => [name, String(value)]),
    ).toString();
    return `smtp://127.0.0.1:${this.port}${query === '' ? '' : `?${query}`}`;
  }

  /** Answers `550 5.1.1` to `RCPT TO` for this address, like a mailbox that no longer exists. */
  refuse(address: string): void {
    this.refused.add(address.toLowerCase());
  }

  /** The messages one address received. */
  to(address: string): StubMessage[] {
    return this.messages.filter((message) => message.to.includes(address));
  }

  /** Stops listening and drops open connections: the next sends meet a refused connection. */
  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    for (const socket of this.sockets) {
      socket.destroy();
    }
    if (server !== null) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    }
  }

  /** Listens again on the same port, as a server back from an outage. */
  restart(): Promise<void> {
    return this.listen();
  }

  private listen(): Promise<void> {
    const server = createServer((socket) => {
      this.serve(socket);
    });
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.port, '127.0.0.1', () => {
        const address = server.address();
        if (address === null || typeof address === 'string') {
          reject(new Error('The SMTP stub has no TCP port'));
          return;
        }
        this.port = address.port;
        this.server = server;
        resolve();
      });
    });
  }

  private serve(socket: Socket): void {
    this.connections += 1;
    this.sockets.add(socket);
    socket.on('close', () => this.sockets.delete(socket));
    // A client that gives up resets the connection; that is its business, not the stub's.
    socket.on('error', () => socket.destroy());
    const mode = this.mode;
    if (mode === 'silent') {
      return;
    }
    const reply = (line: string) => socket.write(`${line}\r\n`);
    let buffer = '';
    let inData = false;
    let recipients: string[] = [];
    reply('220 smtp-stub ESMTP');
    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      for (;;) {
        if (inData) {
          const end = buffer.indexOf('\r\n.\r\n');
          if (end === -1) {
            return;
          }
          // The client doubled every leading dot of a line (RFC 5321, 4.5.2).
          const data = buffer.slice(0, end).replace(/(^|\r\n)\.\./g, '$1.');
          this.messages.push({ to: recipients, data });
          buffer = buffer.slice(end + 5);
          inData = false;
          recipients = [];
          reply('250 2.0.0 Ok: queued');
          continue;
        }
        const end = buffer.indexOf('\r\n');
        if (end === -1) {
          return;
        }
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const command = line.slice(0, 4).toUpperCase();
        if (command === 'EHLO') {
          reply('250-smtp-stub');
          reply('250 8BITMIME');
        } else if (command === 'HELO' || command === 'NOOP' || command === 'RSET') {
          recipients = command === 'RSET' ? [] : recipients;
          reply('250 2.0.0 Ok');
        } else if (command === 'MAIL') {
          reply('250 2.1.0 Ok');
        } else if (command === 'RCPT') {
          const address = /<([^>]*)>/.exec(line)?.[1]?.toLowerCase() ?? '';
          if (this.refused.has(address)) {
            reply(`550 5.1.1 <${address}>: Recipient address rejected: User unknown`);
          } else {
            recipients.push(address);
            reply('250 2.1.5 Ok');
          }
        } else if (command === 'DATA') {
          if (mode === 'stall') {
            return;
          }
          inData = true;
          reply('354 End data with <CR><LF>.<CR><LF>');
        } else if (command === 'QUIT') {
          reply('221 2.0.0 Bye');
          socket.end();
          return;
        } else {
          reply('502 5.5.2 Error: command not recognized');
        }
      }
    });
  }
}

/** The plain text part of a message the stub took, decoded. */
export function plainTextOf(message: StubMessage): string {
  const boundary = /boundary="?([^";\r\n]+)"?/i.exec(message.data)?.[1];
  const parts = boundary === undefined ? [message.data] : message.data.split(`--${boundary}`);
  const part = parts.find((item) => /content-type:\s*text\/plain/i.test(item));
  if (part === undefined) {
    throw new Error('The message has no plain text part');
  }
  const split = part.indexOf('\r\n\r\n');
  const headers = part.slice(0, split);
  const body = part.slice(split + 4);
  const encoding = /content-transfer-encoding:\s*([\w-]+)/i.exec(headers)?.[1]?.toLowerCase();
  if (encoding === 'base64') {
    return Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
  }
  if (encoding === 'quoted-printable') {
    const bytes = body
      .replace(/=\r\n/g, '')
      .replace(/=([0-9A-F]{2})/gi, (_match, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16)),
      );
    return Buffer.from(bytes, 'latin1').toString('utf8');
  }
  return body;
}

/** The last confirmation link (its site and secret) the stub saw for `email`. */
export function stubConfirmationLink(stub: SmtpStub, email: string): ConfirmationLink {
  const message = stub.to(email).at(-1);
  const link = message === undefined ? null : confirmationLinkIn(plainTextOf(message));
  if (link === null) {
    throw new Error(`The SMTP stub received no confirmation link for ${email}`);
  }
  return link;
}
