import dgram from 'node:dgram';
import net from 'node:net';
import dnsPacket, {
  type Answer,
  type DecodedPacket,
  type Question,
} from 'dns-packet';

export type DecodedResponse = DecodedPacket & { rcode?: string };

export const DNS_HOST = '127.0.0.1';
export const DNS_PORT = 15353;
export const TIMEOUT_MS = 5000;

export interface TestCase {
  domain: string;
  type: Question['type'];
}

/**
 * UDP DNS 질의 — 지정된 Transaction ID 사용 가능
 */
export function queryUdp(
  testCase: TestCase,
  id?: number
): Promise<DecodedResponse> {
  return new Promise((resolve, reject) => {
    const client = dgram.createSocket('udp4');

    const timer = setTimeout(() => {
      client.close();
      reject(new Error(`UDP timeout: ${testCase.domain} ${testCase.type}`));
    }, TIMEOUT_MS);

    const query = dnsPacket.encode({
      type: 'query',
      id: id ?? Math.floor(Math.random() * 0xffff),
      flags: dnsPacket.RECURSION_DESIRED,
      questions: [{ type: testCase.type, name: testCase.domain }],
    });

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
  });
}

/**
 * TCP DNS 질의 — 지정된 Transaction ID 사용 가능
 */
export function queryTcp(
  testCase: TestCase,
  id?: number
): Promise<DecodedResponse> {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();

    const timer = setTimeout(() => {
      client.destroy();
      reject(new Error(`TCP timeout: ${testCase.domain} ${testCase.type}`));
    }, TIMEOUT_MS);

    const query = dnsPacket.encode({
      type: 'query',
      id: id ?? Math.floor(Math.random() * 0xffff),
      flags: dnsPacket.RECURSION_DESIRED,
      questions: [{ type: testCase.type, name: testCase.domain }],
    });

    const lengthPrefix = Buffer.alloc(2);
    lengthPrefix.writeUInt16BE(query.length, 0);

    client.connect(DNS_PORT, DNS_HOST, () => {
      client.write(Buffer.concat([lengthPrefix, query]));
    });

    const chunks: Buffer[] = [];
    client.on('data', (data: Buffer | string) => {
      chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
      const accumulated = Buffer.concat(chunks);
      if (accumulated.length < 2) return;
      const expectedLen = accumulated.readUInt16BE(0);
      if (accumulated.length >= expectedLen + 2) {
        clearTimeout(timer);
        client.destroy();
        resolve(dnsPacket.decode(accumulated.subarray(2, 2 + expectedLen)));
      }
    });

    client.on('error', (err) => {
      clearTimeout(timer);
      client.destroy();
      reject(err);
    });
  });
}

/**
 * UDP로 raw 버퍼 전송 — 응답이 오면 반환, 타임아웃 시 null
 */
export function sendRawUdp(
  buf: Buffer,
  timeoutMs = 2000
): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const client = dgram.createSocket('udp4');

    const timer = setTimeout(() => {
      client.close();
      resolve(null);
    }, timeoutMs);

    client.send(buf, DNS_PORT, DNS_HOST, (err) => {
      if (err) {
        clearTimeout(timer);
        client.close();
        reject(err);
      }
    });

    client.on('message', (msg) => {
      clearTimeout(timer);
      client.close();
      resolve(msg);
    });
  });
}

/**
 * TCP 연결 하나에서 여러 DNS 메시지를 전송하고 모든 응답 수신
 */
export function sendTcpPipelined(
  messages: Buffer[],
  expectedResponses: number
): Promise<DecodedResponse[]> {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    const results: DecodedResponse[] = [];

    const timer = setTimeout(() => {
      client.destroy();
      reject(
        new Error(
          `TCP pipelining timeout: got ${results.length}/${expectedResponses}`
        )
      );
    }, TIMEOUT_MS);

    client.connect(DNS_PORT, DNS_HOST, () => {
      const framed = messages.map((msg) => {
        const prefix = Buffer.alloc(2);
        prefix.writeUInt16BE(msg.length, 0);
        return Buffer.concat([prefix, msg]);
      });
      client.write(Buffer.concat(framed));
    });

    let buffer = Buffer.alloc(0);
    client.on('data', (data: Buffer | string) => {
      buffer = Buffer.concat([
        buffer,
        Buffer.isBuffer(data) ? data : Buffer.from(data),
      ]);

      while (buffer.length >= 2) {
        const msgLen = buffer.readUInt16BE(0);
        if (buffer.length < 2 + msgLen) break;

        const dnsMsg = buffer.subarray(2, 2 + msgLen);
        buffer = buffer.subarray(2 + msgLen);
        results.push(dnsPacket.decode(dnsMsg));

        if (results.length >= expectedResponses) {
          clearTimeout(timer);
          client.destroy();
          resolve(results);
          return;
        }
      }
    });

    client.on('error', (err) => {
      clearTimeout(timer);
      client.destroy();
      reject(err);
    });
  });
}

/**
 * TCP로 raw 버퍼 전송 (length-prefix 포함된 상태) — 서버 생존 확인용
 * 전송 후 잠시 대기한 뒤 연결 종료
 */
export function sendRawTcp(
  buf: Buffer,
  timeoutMs = 2000
): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const client = new net.Socket();
    let received = Buffer.alloc(0);

    const timer = setTimeout(() => {
      client.destroy();
      resolve(received.length > 0 ? received : null);
    }, timeoutMs);

    client.connect(DNS_PORT, DNS_HOST, () => {
      client.write(buf);
    });

    client.on('data', (data: Buffer | string) => {
      received = Buffer.concat([
        received,
        Buffer.isBuffer(data) ? data : Buffer.from(data),
      ]);
    });

    client.on('error', () => {
      clearTimeout(timer);
      client.destroy();
      resolve(null);
    });

    client.on('close', () => {
      clearTimeout(timer);
      resolve(received.length > 0 ? received : null);
    });
  });
}

export function formatAnswerData(
  ans: Exclude<Answer, dnsPacket.OptAnswer>
): string {
  const { data } = ans;
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('hex');
  if (Array.isArray(data))
    return data
      .map((b) => (Buffer.isBuffer(b) ? b.toString('utf-8') : String(b)))
      .join(' ');
  if (data && typeof data === 'object') return JSON.stringify(data);
  return String(data);
}

export function getNonOptAnswers(
  response: DecodedResponse
): Exclude<Answer, dnsPacket.OptAnswer>[] {
  return (response.answers ?? []).filter(
    (a): a is Exclude<Answer, dnsPacket.OptAnswer> => a.type !== 'OPT'
  );
}

export function encodeDnsQuery(
  testCase: TestCase,
  id?: number,
  additionals?: dnsPacket.OptAnswer[]
): Buffer {
  return dnsPacket.encode({
    type: 'query',
    id: id ?? Math.floor(Math.random() * 0xffff),
    flags: dnsPacket.RECURSION_DESIRED,
    questions: [{ type: testCase.type, name: testCase.domain }],
    ...(additionals ? { additionals } : {}),
  });
}
