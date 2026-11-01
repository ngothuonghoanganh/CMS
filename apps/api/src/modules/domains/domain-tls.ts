import { connect } from 'node:tls';

/** What a TLS handshake with the domain showed. */
export type TlsProbeResult = { ok: true; validUntil: Date } | { ok: false };

/**
 * Checks that visitors of the domain get a valid certificate for it on port 443 (ADR-022). An
 * abstract class so integration tests can replace it.
 */
export abstract class DomainTls {
  abstract probe(hostname: string): Promise<TlsProbeResult>;
}

/**
 * Asks the edge itself, with the domain as SNI: a verified domain points there, so this is the
 * certificate its visitors get. Connecting to wherever the customer's DNS points instead would
 * let a domain aim the API at hosts of the internal network.
 */
export class NetworkDomainTls extends DomainTls {
  constructor(private readonly edgeAddress: string) {
    super();
  }

  probe(hostname: string): Promise<TlsProbeResult> {
    return new Promise((resolve) => {
      const socket = connect({
        host: this.edgeAddress,
        port: 443,
        servername: hostname,
        timeout: 5000,
      });
      const done = (result: TlsProbeResult) => {
        socket.destroy();
        resolve(result);
      };
      socket.once('secureConnect', () => {
        const certificate = socket.getPeerCertificate();
        // `authorized` covers the chain, the name and the dates.
        done(
          socket.authorized && certificate.valid_to
            ? { ok: true, validUntil: new Date(certificate.valid_to) }
            : { ok: false },
        );
      });
      socket.once('timeout', () => {
        done({ ok: false });
      });
      socket.once('error', () => {
        done({ ok: false });
      });
    });
  }
}
