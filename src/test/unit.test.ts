import dnsPacket from 'dns-packet';
import { describe, it, expect } from 'vitest';
import { buildServFailResponse } from '../doh/client.js';
import type { DecodedResponse } from './helpers.js';
//------------------------------------------------------------------------------//

describe('buildServFailResponse', () => {
  it('returns SERVFAIL with matching transaction ID', () => {
    const query = dnsPacket.encode({
      type: 'query',
      id: 0xbeef,
      flags: dnsPacket.RECURSION_DESIRED,
      questions: [{ type: 'A', name: 'example.com' }],
    });

    const res = dnsPacket.decode(buildServFailResponse(query)) as DecodedResponse;
    expect(res.id).toBe(0xbeef);
    expect(res.rcode).toBe('SERVFAIL');
  });

  it('sets QR=1, RD=1, RA=1 flags', () => {
    const query = dnsPacket.encode({
      type: 'query',
      id: 0x1234,
      flags: dnsPacket.RECURSION_DESIRED,
      questions: [{ type: 'A', name: 'test.com' }],
    });

    const res = dnsPacket.decode(buildServFailResponse(query));
    expect(res.flag_qr).toBe(true);
    expect(res.flag_rd).toBe(true);
    expect(res.flag_ra).toBe(true);
  });

  it('clears answer, authority, and additional counts', () => {
    const query = dnsPacket.encode({
      type: 'query',
      id: 0x5678,
      flags: dnsPacket.RECURSION_DESIRED,
      questions: [{ type: 'MX', name: 'example.com' }],
    });

    const res = dnsPacket.decode(buildServFailResponse(query));
    expect(res.answers ?? []).toHaveLength(0);
    expect(res.authorities ?? []).toHaveLength(0);
    expect(res.additionals ?? []).toHaveLength(0);
  });

  it('preserves question section from original query', () => {
    const query = dnsPacket.encode({
      type: 'query',
      id: 0xaaaa,
      flags: dnsPacket.RECURSION_DESIRED,
      questions: [{ type: 'AAAA', name: 'github.com' }],
    });

    const res = dnsPacket.decode(buildServFailResponse(query));
    expect(res.questions).toHaveLength(1);
    expect(res.questions![0].name).toBe('github.com');
    expect(res.questions![0].type).toBe('AAAA');
  });

  it('handles buffer shorter than 12 bytes', () => {
    const tiny = Buffer.from([0x00, 0x01]);
    const res = buildServFailResponse(tiny);
    expect(res.length).toBe(12);
    const decoded = dnsPacket.decode(res) as DecodedResponse;
    expect(decoded.rcode).toBe('SERVFAIL');
  });

  it('handles empty buffer', () => {
    const empty = Buffer.alloc(0);
    const res = buildServFailResponse(empty);
    expect(res.length).toBe(12);
    const decoded = dnsPacket.decode(res) as DecodedResponse;
    expect(decoded.rcode).toBe('SERVFAIL');
  });
});
