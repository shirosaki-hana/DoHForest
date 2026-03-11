import dgram from 'node:dgram';
import net from 'node:net';
import dnsPacket, { type Answer, type DecodedPacket, type Question } from 'dns-packet';
//------------------------------------------------------------------------------//

type DecodedResponse = DecodedPacket & { rcode?: string };

const DNS_HOST = '127.0.0.1';
const DNS_PORT = 5353;
const TIMEOUT_MS = 5000;

interface TestCase {
  domain: string;
  type: Question['type'];
}

const testCases: TestCase[] = [
  { domain: 'example.com', type: 'A' },
  { domain: 'example.com', type: 'AAAA' },
  { domain: 'google.com', type: 'A' },
  { domain: 'cloudflare.com', type: 'MX' },
  { domain: 'github.com', type: 'A' },
  { domain: 'example.com', type: 'TXT' },
  { domain: 'example.com', type: 'NS' },
  { domain: '_dmarc.google.com', type: 'TXT' },
];

//------------------------------------------------------------------------------//
// UDP 질의
//------------------------------------------------------------------------------//

function queryUdp(testCase: TestCase): Promise<DecodedResponse> {
  return new Promise((resolve, reject) => {
    const client = dgram.createSocket('udp4');

    const timer = setTimeout(() => {
      client.close();
      reject(new Error(`UDP timeout: ${testCase.domain} ${testCase.type}`));
    }, TIMEOUT_MS);

    const query = dnsPacket.encode({
      type: 'query',
      id: Math.floor(Math.random() * 0xffff),
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

//------------------------------------------------------------------------------//
// TCP 질의 (2-byte length prefix)
//------------------------------------------------------------------------------//

function queryTcp(testCase: TestCase): Promise<DecodedResponse> {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();

    const timer = setTimeout(() => {
      client.destroy();
      reject(new Error(`TCP timeout: ${testCase.domain} ${testCase.type}`));
    }, TIMEOUT_MS);

    const query = dnsPacket.encode({
      type: 'query',
      id: Math.floor(Math.random() * 0xffff),
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

//------------------------------------------------------------------------------//
// 결과 출력
//------------------------------------------------------------------------------//

function formatAnswerData(ans: Exclude<Answer, dnsPacket.OptAnswer>): string {
  const { data } = ans;
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('hex');
  if (Array.isArray(data))
    return data.map((b) => (Buffer.isBuffer(b) ? b.toString('utf-8') : String(b))).join(' ');
  if (data && typeof data === 'object') return JSON.stringify(data);
  return String(data);
}

function printResult(protocol: string, testCase: TestCase, response: DecodedResponse) {
  const answers = response.answers ?? [];
  const rcode = response.rcode ?? 'UNKNOWN';
  const tag = `[${protocol}]`;

  if (answers.length === 0) {
    console.log(`  ${tag} ${testCase.domain} ${testCase.type} → (${rcode}, no answers)`);
    return;
  }

  for (const ans of answers) {
    if (ans.type === 'OPT') continue;
    const ttl = ans.ttl ?? '-';
    console.log(
      `  ${tag} ${testCase.domain} ${testCase.type} → ${formatAnswerData(ans)}  (TTL=${ttl}, rcode=${rcode})`
    );
  }
}

//------------------------------------------------------------------------------//
// 메인
//------------------------------------------------------------------------------//

async function runTests() {
  console.log('='.repeat(70));
  console.log(`  DoHForest DNS Test — target ${DNS_HOST}:${DNS_PORT}`);
  console.log('='.repeat(70));

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    console.log(`\n▶ ${tc.domain} (${tc.type})`);

    // UDP
    try {
      const res = await queryUdp(tc);
      printResult('UDP', tc, res);
      passed++;
    } catch (err) {
      console.log(`  [UDP] FAIL — ${(err as Error).message}`);
      failed++;
    }

    // TCP
    try {
      const res = await queryTcp(tc);
      printResult('TCP', tc, res);
      passed++;
    } catch (err) {
      console.log(`  [TCP] FAIL — ${(err as Error).message}`);
      failed++;
    }
  }

  // 동일 도메인 2회 질의 → 캐시 동작 확인
  console.log('\n' + '-'.repeat(70));
  console.log('  Cache test: querying example.com A twice via UDP');
  console.log('-'.repeat(70));

  const cacheTc: TestCase = { domain: 'example.com', type: 'A' };
  try {
    const t0 = performance.now();
    await queryUdp(cacheTc);
    const first = performance.now() - t0;

    const t1 = performance.now();
    const res2 = await queryUdp(cacheTc);
    const second = performance.now() - t1;

    console.log(`  1st query: ${first.toFixed(1)} ms`);
    console.log(`  2nd query: ${second.toFixed(1)} ms  (expected faster if cached)`);
    printResult('UDP', cacheTc, res2);
    passed += 2;
  } catch (err) {
    console.log(`  FAIL — ${(err as Error).message}`);
    failed += 2;
  }

  console.log('\n' + '='.repeat(70));
  console.log(`  Results: ${passed} passed, ${failed} failed (total ${passed + failed})`);
  console.log('='.repeat(70));

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
