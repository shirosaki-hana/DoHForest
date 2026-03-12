import { describe, it, expect } from 'vitest';
import {
  queryUdp,
  queryTcp,
  getNonOptAnswers,
  type TestCase,
} from './helpers.js';

describe('Response flags', () => {
  it('UDP — QR=1, RD=1, RA=1 in response', async () => {
    const res = await queryUdp({ domain: 'example.com', type: 'A' });
    expect(res.flag_qr).toBe(true);
    expect(res.flag_rd).toBe(true);
    expect(res.flag_ra).toBe(true);
  });

  it('TCP — QR=1, RD=1, RA=1 in response', async () => {
    const res = await queryTcp({ domain: 'example.com', type: 'A' });
    expect(res.flag_qr).toBe(true);
    expect(res.flag_rd).toBe(true);
    expect(res.flag_ra).toBe(true);
  });

  it('NXDOMAIN response also has correct flags', async () => {
    const res = await queryUdp({
      domain: 'nonexistent-flag-test-domain-12345.com',
      type: 'A',
    });
    expect(res.flag_qr).toBe(true);
    expect(res.flag_rd).toBe(true);
    expect(res.flag_ra).toBe(true);
    expect(res.rcode).toBe('NXDOMAIN');
  });
});

describe('Answer record type matching', () => {
  const cases: TestCase[] = [
    { domain: 'example.com', type: 'A' },
    { domain: 'example.com', type: 'AAAA' },
    { domain: 'cloudflare.com', type: 'MX' },
    { domain: 'example.com', type: 'TXT' },
    { domain: 'example.com', type: 'NS' },
    { domain: 'example.com', type: 'SOA' },
    { domain: 'google.com', type: 'CAA' },
  ];

  for (const tc of cases) {
    it(`${tc.domain} ${tc.type} — answers contain only ${tc.type} or CNAME`, async () => {
      const res = await queryUdp(tc);
      const answers = getNonOptAnswers(res);
      for (const ans of answers) {
        expect(
          [tc.type, 'CNAME'].includes(ans.type),
          `expected ${tc.type} or CNAME, got ${ans.type}`
        ).toBe(true);
      }
    });
  }
});

describe('Question section echo-back', () => {
  it('UDP — response contains correct question', async () => {
    const res = await queryUdp({ domain: 'example.com', type: 'A' });
    expect(res.questions).toHaveLength(1);
    expect(res.questions![0].name.toLowerCase()).toBe('example.com');
    expect(res.questions![0].type).toBe('A');
  });

  it('TCP — response contains correct question', async () => {
    const res = await queryTcp({ domain: 'github.com', type: 'AAAA' });
    expect(res.questions).toHaveLength(1);
    expect(res.questions![0].name.toLowerCase()).toBe('github.com');
    expect(res.questions![0].type).toBe('AAAA');
  });

  it('cached response preserves question section', async () => {
    const tc = { domain: 'example.com', type: 'A' as const };
    await queryUdp(tc);
    const res = await queryUdp(tc);
    expect(res.questions).toHaveLength(1);
    expect(res.questions![0].name.toLowerCase()).toBe('example.com');
    expect(res.questions![0].type).toBe('A');
  });
});
