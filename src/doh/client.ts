import { queryUpstream } from './providers.js';
import type { DoHQueryResult } from './types.js';
//------------------------------------------------------------------------------//

/**
 * DNS wire format 질의를 DoH 업스트림으로 전달하고 응답을 반환
 *
 * @param queryBuffer - 클라이언트로부터 받은 raw DNS query (wire format)
 * @returns DoH 응답 결과 또는 null (전체 실패 시)
 */
export async function resolveViaDoH(queryBuffer: Buffer): Promise<DoHQueryResult | null> {
  return queryUpstream(queryBuffer);
}

/**
 * SERVFAIL 응답 생성 (DNS wire format 직접 조작)
 *
 * DNS header format (12 bytes):
 *   [0-1]  Transaction ID
 *   [2-3]  Flags (QR=1, RD=1, RA=1, RCODE=2=SERVFAIL)
 *   [4-5]  QDCOUNT
 *   [6-7]  ANCOUNT = 0
 *   [8-9]  NSCOUNT = 0
 *   [10-11] ARCOUNT = 0
 *
 * 원본 질의의 Question 섹션을 그대로 복사
 */
export function buildServFailResponse(queryBuffer: Buffer): Buffer {
  if (queryBuffer.length < 12) {
    const minimal = Buffer.alloc(12);
    minimal.writeUInt16BE(0x8182, 2); // QR=1, RD=1, RA=1, RCODE=SERVFAIL
    return minimal;
  }

  const response = Buffer.from(queryBuffer);
  // QR=1 (response), RD=1, RA=1, RCODE=2 (SERVFAIL)
  response.writeUInt16BE(0x8182, 2);
  // ANCOUNT = 0
  response.writeUInt16BE(0, 6);
  // NSCOUNT = 0
  response.writeUInt16BE(0, 8);
  // ARCOUNT = 0
  response.writeUInt16BE(0, 10);

  return response;
}
