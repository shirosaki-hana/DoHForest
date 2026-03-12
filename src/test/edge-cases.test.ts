import dgram from 'node:dgram';
import { describe, it, expect } from 'vitest';
import dnsPacket from 'dns-packet';
import {
  queryUdp,
  queryTcp,
  sendRawUdp,
  getNonOptAnswers,
  formatAnswerData,
  DNS_HOST,
  DNS_PORT,
} from './helpers.js';

describe('NXDOMAIN', () => {
  const tc = {
    domain: 'this-domain-surely-does-not-exist-98765.com',
    type: 'A' as const,
  };

  it('UDP — returns NXDOMAIN for non-existent domain', async () => {
    const res = await queryUdp(tc);
    expect(res.rcode).toBe('NXDOMAIN');
  });

  it('TCP — returns NXDOMAIN for non-existent domain', async () => {
    const res = await queryTcp(tc);
    expect(res.rcode).toBe('NXDOMAIN');
  });
});

describe('Empty answer', () => {
  const tc = { domain: 'example.com', type: 'SRV' as const };

  it('UDP — NOERROR with 0 answers', async () => {
    const res = await queryUdp(tc);
    expect(res.rcode).toBe('NOERROR');
    expect(getNonOptAnswers(res)).toHaveLength(0);
  });

  it('TCP — NOERROR with 0 answers', async () => {
    const res = await queryTcp(tc);
    expect(res.rcode).toBe('NOERROR');
    expect(getNonOptAnswers(res)).toHaveLength(0);
  });
});

describe('Case-insensitive domain', () => {
  it('EXAMPLE.COM and example.com resolve to the same addresses', async () => {
    const resUpper = await queryUdp({ domain: 'EXAMPLE.COM', type: 'A' });
    const resLower = await queryUdp({ domain: 'example.com', type: 'A' });

    const answersUpper = getNonOptAnswers(resUpper)
      .map(formatAnswerData)
      .sort();
    const answersLower = getNonOptAnswers(resLower)
      .map(formatAnswerData)
      .sort();

    expect(answersUpper).toEqual(answersLower);
    expect(answersLower.length).toBeGreaterThan(0);
  });
});

describe('Malformed UDP packet', () => {
  it('server survives garbage and still responds to valid queries', async () => {
    const garbage = Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x00, 0x01]);
    await sendRawUdp(garbage);

    const res = await queryUdp({ domain: 'example.com', type: 'A' });
    expect(getNonOptAnswers(res).length).toBeGreaterThan(0);
  });
});

describe('SERVFAIL — empty/invalid questions', () => {
  it('UDP — returns SERVFAIL for query with no questions', async () => {
    const query = dnsPacket.encode({
      type: 'query',
      id: 0xfa11,
      flags: dnsPacket.RECURSION_DESIRED,
      questions: [],
    });

    const raw = await sendRawUdp(query);
    expect(raw).not.toBeNull();

    const res = dnsPacket.decode(raw!) as dnsPacket.DecodedPacket & {
      rcode?: string;
    };
    expect(res.rcode).toBe('SERVFAIL');
  });

  it('TCP — returns SERVFAIL for query with no questions', async () => {
    const net = await import('node:net');
    const query = dnsPacket.encode({
      type: 'query',
      id: 0xfa12,
      flags: dnsPacket.RECURSION_DESIRED,
      questions: [],
    });

    const res = await new Promise<dnsPacket.DecodedPacket & { rcode?: string }>(
      (resolve, reject) => {
        const client = new net.Socket();
        const timer = setTimeout(() => {
          client.destroy();
          reject(new Error('TCP SERVFAIL timeout'));
        }, 5000);

        const prefix = Buffer.alloc(2);
        prefix.writeUInt16BE(query.length, 0);

        client.connect(DNS_PORT, DNS_HOST, () => {
          client.write(Buffer.concat([prefix, query]));
        });

        const chunks: Buffer[] = [];
        client.on('data', (data: Buffer | string) => {
          chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
          const acc = Buffer.concat(chunks);
          if (acc.length < 2) return;
          const len = acc.readUInt16BE(0);
          if (acc.length >= 2 + len) {
            clearTimeout(timer);
            client.destroy();
            resolve(dnsPacket.decode(acc.subarray(2, 2 + len)));
          }
        });

        client.on('error', (err) => {
          clearTimeout(timer);
          client.destroy();
          reject(err);
        });
      }
    );

    expect(res.rcode).toBe('SERVFAIL');
  });
});

describe('Concurrent queries', () => {
  it('resolves 10 different domains simultaneously via UDP', async () => {
    const domains = [
      'example.com',
      'google.com',
      'github.com',
      'cloudflare.com',
      'mozilla.org',
      'wikipedia.org',
      'nodejs.org',
      'npmjs.com',
      'microsoft.com',
      'apple.com',
    ];

    const results = await Promise.all(
      domains.map((domain) => queryUdp({ domain, type: 'A' }))
    );

    for (let i = 0; i < results.length; i++) {
      expect(results[i].rcode).toBe('NOERROR');
      expect(
        getNonOptAnswers(results[i]).length,
        `${domains[i]} should have answers`
      ).toBeGreaterThan(0);
    }
  });

  it('resolves 10 different domains simultaneously via TCP', async () => {
    const domains = [
      'example.com',
      'google.com',
      'github.com',
      'cloudflare.com',
      'mozilla.org',
      'wikipedia.org',
      'nodejs.org',
      'npmjs.com',
      'microsoft.com',
      'apple.com',
    ];

    const results = await Promise.all(
      domains.map((domain) => queryTcp({ domain, type: 'A' }))
    );

    for (let i = 0; i < results.length; i++) {
      expect(results[i].rcode).toBe('NOERROR');
      expect(
        getNonOptAnswers(results[i]).length,
        `${domains[i]} should have answers`
      ).toBeGreaterThan(0);
    }
  });
});
