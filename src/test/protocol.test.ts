import { describe, it, expect } from 'vitest';
import dnsPacket from 'dns-packet';
import {
  queryUdp,
  sendRawTcp,
  sendTcpPipelined,
  encodeDnsQuery,
  getNonOptAnswers,
  DNS_HOST,
  DNS_PORT,
} from './helpers.js';

describe('TCP pipelining', () => {
  it('receives 2 correct responses for 2 queries on one connection', async () => {
    const q1 = encodeDnsQuery({ domain: 'example.com', type: 'A' }, 0x1111);
    const q2 = encodeDnsQuery({ domain: 'google.com', type: 'A' }, 0x2222);

    const responses = await sendTcpPipelined([q1, q2], 2);

    expect(responses).toHaveLength(2);
    expect(responses[0].id).toBe(0x1111);
    expect(responses[1].id).toBe(0x2222);
    expect(responses[0].rcode).toBe('NOERROR');
    expect(responses[1].rcode).toBe('NOERROR');
    expect(getNonOptAnswers(responses[0]).length).toBeGreaterThan(0);
    expect(getNonOptAnswers(responses[1]).length).toBeGreaterThan(0);
  });

  it('receives 3 responses for 3 queries on one connection', async () => {
    const queries = [
      encodeDnsQuery({ domain: 'example.com', type: 'NS' }, 0x0001),
      encodeDnsQuery({ domain: 'github.com', type: 'A' }, 0x0002),
      encodeDnsQuery({ domain: 'google.com', type: 'MX' }, 0x0003),
    ];

    const responses = await sendTcpPipelined(queries, 3);

    expect(responses).toHaveLength(3);
    for (const res of responses) {
      expect(res.rcode).toBe('NOERROR');
    }
  });
});

describe('TCP malformed packets', () => {
  it('server survives garbage data with length prefix', async () => {
    const garbage = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    const prefix = Buffer.alloc(2);
    prefix.writeUInt16BE(garbage.length, 0);

    await sendRawTcp(Buffer.concat([prefix, garbage]));

    // Health check
    const res = await queryUdp({ domain: 'example.com', type: 'A' });
    expect(getNonOptAnswers(res).length).toBeGreaterThan(0);
  });

  it('server survives length prefix only (no payload)', async () => {
    const prefix = Buffer.alloc(2);
    prefix.writeUInt16BE(100, 0);

    await sendRawTcp(prefix, 1000);

    const res = await queryUdp({ domain: 'example.com', type: 'A' });
    expect(getNonOptAnswers(res).length).toBeGreaterThan(0);
  });

  it('server survives zero-length prefix', async () => {
    const prefix = Buffer.alloc(2);
    prefix.writeUInt16BE(0, 0);

    await sendRawTcp(prefix, 1000);

    const res = await queryUdp({ domain: 'example.com', type: 'A' });
    expect(getNonOptAnswers(res).length).toBeGreaterThan(0);
  });

  it('server survives empty TCP connection (connect + close)', async () => {
    const net = await import('node:net');
    await new Promise<void>((resolve) => {
      const client = new net.Socket();
      client.connect(DNS_PORT, DNS_HOST, () => {
        client.destroy();
        resolve();
      });
      client.on('error', () => resolve());
    });

    const res = await queryUdp({ domain: 'example.com', type: 'A' });
    expect(getNonOptAnswers(res).length).toBeGreaterThan(0);
  });
});

describe('EDNS0 (OPT record)', () => {
  it('UDP — responds correctly when query includes OPT', async () => {
    const query = dnsPacket.encode({
      type: 'query',
      id: 0xed50,
      flags: dnsPacket.RECURSION_DESIRED,
      questions: [{ type: 'A', name: 'example.com' }],
      additionals: [
        {
          type: 'OPT',
          name: '.',
          udpPayloadSize: 4096,
          extendedRcode: 0,
          ednsVersion: 0,
          flags: 0,
          flag_do: false,
          options: [],
        },
      ],
    });

    const dgram = await import('node:dgram');
    const res = await new Promise<dnsPacket.DecodedPacket>(
      (resolve, reject) => {
        const client = dgram.createSocket('udp4');
        const timer = setTimeout(() => {
          client.close();
          reject(new Error('EDNS0 UDP timeout'));
        }, 5000);

        client.send(query, DNS_PORT, DNS_HOST, (err) => {
          if (err) {
            clearTimeout(timer);
            client.close();
            reject(err);
          }
        });

        client.on('message', (msg) => {
          clearTimeout(timer);
          client.close();
          resolve(dnsPacket.decode(msg));
        });
      }
    );

    expect(res.id).toBe(0xed50);
    const answers = (res.answers ?? []).filter((a) => a.type !== 'OPT');
    expect(answers.length).toBeGreaterThan(0);
  });

  it('TCP — responds correctly when query includes OPT', async () => {
    const query = dnsPacket.encode({
      type: 'query',
      id: 0xed51,
      flags: dnsPacket.RECURSION_DESIRED,
      questions: [{ type: 'AAAA', name: 'example.com' }],
      additionals: [
        {
          type: 'OPT',
          name: '.',
          udpPayloadSize: 4096,
          extendedRcode: 0,
          ednsVersion: 0,
          flags: 0,
          flag_do: false,
          options: [],
        },
      ],
    });

    const net = await import('node:net');
    const res = await new Promise<dnsPacket.DecodedPacket>(
      (resolve, reject) => {
        const client = new net.Socket();
        const timer = setTimeout(() => {
          client.destroy();
          reject(new Error('EDNS0 TCP timeout'));
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

    expect(res.id).toBe(0xed51);
    const answers = (res.answers ?? []).filter((a) => a.type !== 'OPT');
    expect(answers.length).toBeGreaterThan(0);
  });
});
