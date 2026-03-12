import { describe, it, expect } from 'vitest';
import {
  queryUdp,
  queryTcp,
  getNonOptAnswers,
  formatAnswerData,
} from './helpers.js';

describe('DNS cache', () => {
  it('2nd query should be faster than 1st (cache hit)', async () => {
    const tc = { domain: 'dcinside.com', type: 'A' as const };

    const t0 = performance.now();
    await queryUdp(tc);
    const first = performance.now() - t0;

    const t1 = performance.now();
    const res2 = await queryUdp(tc);
    const second = performance.now() - t1;

    expect(getNonOptAnswers(res2).length).toBeGreaterThan(0);
    expect(second).toBeLessThan(first);
  });

  describe('transaction ID preservation', () => {
    it('UDP — response ID matches request ID', async () => {
      const tc = { domain: 'example.com', type: 'A' as const };
      const id = 0x1234;

      const res = await queryUdp(tc, id);
      expect(res.id).toBe(id);
    });

    it('TCP — response ID matches request ID', async () => {
      const tc = { domain: 'example.com', type: 'A' as const };
      const id = 0x5678;

      const res = await queryTcp(tc, id);
      expect(res.id).toBe(id);
    });

    it('cache hit returns correct ID for each caller', async () => {
      const tc = { domain: 'cloudflare.com', type: 'A' as const };

      // 1st query — populates cache
      const res1 = await queryUdp(tc, 0xaaaa);
      expect(res1.id).toBe(0xaaaa);

      // 2nd query with different ID — should still get correct ID from cache
      const res2 = await queryUdp(tc, 0xbbbb);
      expect(res2.id).toBe(0xbbbb);

      // Answers should be identical
      const answers1 = getNonOptAnswers(res1).map(formatAnswerData).sort();
      const answers2 = getNonOptAnswers(res2).map(formatAnswerData).sort();
      expect(answers2).toEqual(answers1);
    });
  });

  describe('cache isolation by record type', () => {
    it('A and AAAA for the same domain return different answers', async () => {
      const domainA = { domain: 'google.com', type: 'A' as const };
      const domainAAAA = { domain: 'google.com', type: 'AAAA' as const };

      const resA = await queryUdp(domainA);
      const resAAAA = await queryUdp(domainAAAA);

      const answersA = getNonOptAnswers(resA).map(formatAnswerData).sort();
      const answersAAAA = getNonOptAnswers(resAAAA)
        .map(formatAnswerData)
        .sort();

      expect(resA.rcode).toBe('NOERROR');
      expect(resAAAA.rcode).toBe('NOERROR');
      expect(answersA.length).toBeGreaterThan(0);
      expect(answersAAAA.length).toBeGreaterThan(0);

      // IPv4 and IPv6 must differ
      expect(answersA).not.toEqual(answersAAAA);
    });
  });
});
