import { createHash, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Socket } from 'node:net';

/**
 * How the stub answers the next SendMessage calls:
 * - `accept`: takes the message;
 * - `silent`: reads the request and never answers (a request timeout);
 * - `{ status, type }`: refuses with that HTTP status and AWS error type, e.g. 403 AccessDenied.
 */
export type SqsStubMode = 'accept' | 'silent' | { status: number; type: string };

/** A SendMessage the stub took. */
export interface StubSqsMessage {
  queueUrl: string;
  /** The message body, as sent. */
  body: string;
}

/**
 * A tiny SQS endpoint on 127.0.0.1 that speaks the JSON protocol of `SendMessage`, so
 * `SqsEmailSender` meets the real AWS SDK: its signing, its checksum of the body, its retries, and
 * its errors for a refusal, a 5xx, a refused connection (`stop`) and a silent server.
 */
export class SqsStub {
  mode: SqsStubMode = 'accept';
  readonly messages: StubSqsMessage[] = [];
  /** SendMessage requests received, retries included. */
  requests = 0;
  private readonly sockets = new Set<Socket>();
  private readonly server: Server;
  private port = 0;

  private constructor() {
    this.server = createServer((request, response) => {
      this.handle(request, response).catch((error: unknown) => {
        response.destroy(error instanceof Error ? error : new Error(String(error)));
      });
    });
    this.server.on('connection', (socket) => {
      this.sockets.add(socket);
      socket.on('close', () => this.sockets.delete(socket));
    });
  }

  /** Listens on a port the system picks. */
  static async start(): Promise<SqsStub> {
    const stub = new SqsStub();
    await new Promise<void>((resolve) => stub.server.listen(0, '127.0.0.1', resolve));
    const address = stub.server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('The SQS stub has no port');
    }
    stub.port = address.port;
    return stub;
  }

  /** `MAIL_QUEUE_URL` for this stub. */
  queueUrl(): string {
    return `http://127.0.0.1:${this.port}/000000000000/plp-mailer-MailQueue`;
  }

  /** The requests plp-mailer would read, oldest first. */
  bodies(): unknown[] {
    return this.messages.map((message) => JSON.parse(message.body) as unknown);
  }

  /** Stops listening and drops open connections: the next sends meet a refused connection. */
  async stop(): Promise<void> {
    for (const socket of this.sockets) {
      socket.destroy();
    }
    if (!this.server.listening) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(chunk as Buffer);
    }
    if (request.headers['x-amz-target'] !== 'AmazonSQS.SendMessage') {
      response.writeHead(400).end();
      return;
    }
    this.requests += 1;
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
      QueueUrl: string;
      MessageBody: string;
    };
    const mode = this.mode;
    if (mode === 'silent') {
      return;
    }
    const headers = {
      'content-type': 'application/x-amz-json-1.0',
      'x-amzn-requestid': randomUUID(),
    };
    if (mode !== 'accept') {
      response
        .writeHead(mode.status, headers)
        .end(JSON.stringify({ __type: `com.amazonaws.sqs#${mode.type}`, message: mode.type }));
      return;
    }
    this.messages.push({ queueUrl: input.QueueUrl, body: input.MessageBody });
    response.writeHead(200, headers).end(
      JSON.stringify({
        MessageId: randomUUID(),
        MD5OfMessageBody: createHash('md5').update(input.MessageBody).digest('hex'),
      }),
    );
  }
}
