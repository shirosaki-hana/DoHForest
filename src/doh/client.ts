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
 * Header(12 bytes) + Question 섹션만 포함하고,
 * Answer/Authority/Additional 섹션은 제거하여 일관된 응답 생성
 */
export function buildServFailResponse(queryBuffer: Buffer): Buffer {
  if (queryBuffer.length < 12) {
    const minimal = Buffer.alloc(12);
    minimal.writeUInt16BE(0x8182, 2);
    return minimal;
  }

  const questionEnd = scanQuestionEnd(queryBuffer);
  const response = Buffer.from(queryBuffer.subarray(0, questionEnd));

  response.writeUInt16BE(0x8182, 2);
  response.writeUInt16BE(0, 6); // ANCOUNT = 0
  response.writeUInt16BE(0, 8); // NSCOUNT = 0
  response.writeUInt16BE(0, 10); // ARCOUNT = 0

  return response;
}

/**
 * DNS wire format에서 Question 섹션 끝 오프셋을 반환
 * 파싱 불가 시 버퍼 전체 길이를 반환 (안전한 폴백)
 */
function scanQuestionEnd(buf: Buffer): number {
  const qdcount = buf.readUInt16BE(4);
  let offset = 12;

  for (let i = 0; i < qdcount; i++) {
    while (offset < buf.length) {
      const labelLen = buf[offset]!;
      if (labelLen === 0) {
        offset++;
        break;
      }
      if ((labelLen & 0xc0) === 0xc0) {
        offset += 2;
        break;
      }
      offset += 1 + labelLen;
    }
    offset += 4; // QTYPE (2) + QCLASS (2)
  }

  return Math.min(offset, buf.length);
}
