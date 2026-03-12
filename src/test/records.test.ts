import { describe, it, expect } from 'vitest';
import {
  queryUdp,
  queryTcp,
  getNonOptAnswers,
  type TestCase,
} from './helpers.js';

const recordCases: TestCase[] = [
  { domain: 'example.com', type: 'A' },
  { domain: 'example.com', type: 'AAAA' },
  { domain: 'google.com', type: 'A' },
  { domain: 'cloudflare.com', type: 'MX' },
  { domain: 'github.com', type: 'A' },
  { domain: 'example.com', type: 'TXT' },
  { domain: 'example.com', type: 'NS' },
  { domain: '_dmarc.google.com', type: 'TXT' },
  { domain: 'example.com', type: 'SOA' },
  { domain: 'www.github.com', type: 'CNAME' },
  { domain: '_imaps._tcp.gmail.com', type: 'SRV' },
  { domain: '1.1.1.1.in-addr.arpa', type: 'PTR' },
  { domain: 'google.com', type: 'CAA' },
];

describe('DNS record types', () => {
  for (const tc of recordCases) {
    describe(`${tc.domain} (${tc.type})`, () => {
      it(`UDP — resolves with NOERROR`, async () => {
        const res = await queryUdp(tc);
        expect(res.rcode).toBe('NOERROR');
        expect(getNonOptAnswers(res).length).toBeGreaterThan(0);
      });

      it(`TCP — resolves with NOERROR`, async () => {
        const res = await queryTcp(tc);
        expect(res.rcode).toBe('NOERROR');
        expect(getNonOptAnswers(res).length).toBeGreaterThan(0);
      });
    });
  }
});
