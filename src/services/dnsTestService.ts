import dnsPacket from 'dns-packet';
import { z } from 'zod';
import { resolveViaDoH } from '../doh/client.js';
import { handleDnsQuery } from '../dns/handler.js';
//------------------------------------------------------------------------------//

const DNS_RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SOA', 'SRV', 'PTR', 'CAA'] as const;

const RCODE_NAMES: Record<number, string> = {
  0: 'NOERROR',
  1: 'FORMERR',
  2: 'SERVFAIL',
  3: 'NXDOMAIN',
  4: 'NOTIMP',
  5: 'REFUSED',
};

const dnsLookupSchema = z.object({
  domain: z
    .string()
    .min(1)
    .max(253)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Invalid domain format'),
  type: z.enum(DNS_RECORD_TYPES).default('A'),
  bypassCache: z.boolean().default(true),
});

export type DnsLookupInput = z.input<typeof dnsLookupSchema>;

export interface DnsAnswer {
  name: string;
  type: string;
  ttl: number;
  data: unknown;
}

export interface DnsLookupResult {
  domain: string;
  type: string;
  rcode: string;
  answers: DnsAnswer[];
  authority: DnsAnswer[];
  provider: string | null;
  responseTimeMs: number;
  cached: boolean;
}

export async function performDnsLookup(input: DnsLookupInput): Promise<DnsLookupResult> {
  const { domain, type, bypassCache } = dnsLookupSchema.parse(input);
  const startTime = Date.now();

  const queryBuffer = dnsPacket.encode({
    type: 'query',
    id: Math.floor(Math.random() * 0xffff),
    flags: dnsPacket.RECURSION_DESIRED,
    questions: [{ type: type as dnsPacket.RecordType, name: domain }],
  });

  let responseBuffer: Buffer;
  let providerName: string | null = null;
  let cached = false;

  if (bypassCache) {
    const result = await resolveViaDoH(queryBuffer);
    if (!result) {
      return {
        domain,
        type,
        rcode: 'SERVFAIL',
        answers: [],
        authority: [],
        provider: null,
        responseTimeMs: Date.now() - startTime,
        cached: false,
      };
    }
    responseBuffer = result.responseBuffer;
    providerName = result.provider.name;
  } else {
    responseBuffer = await handleDnsQuery(queryBuffer);
    cached = true;
  }

  const response = dnsPacket.decode(responseBuffer);
  const rawRcode = extractRcode(responseBuffer);
  const rcode = RCODE_NAMES[rawRcode] ?? `UNKNOWN(${rawRcode})`;

  const answers = (response.answers ?? []).map(serializeAnswer);
  const authority = (response.authorities ?? []).map(serializeAnswer);

  if (!bypassCache && providerName === null) {
    const hasAnswers = (response.answers ?? []).length > 0;
    if (hasAnswers) {
      cached = true;
    }
  }

  return {
    domain,
    type,
    rcode,
    answers,
    authority,
    provider: providerName,
    responseTimeMs: Date.now() - startTime,
    cached,
  };
}

function serializeAnswer(record: dnsPacket.Answer): DnsAnswer {
  return {
    name: record.name,
    type: record.type,
    ttl: (record as { ttl?: number }).ttl ?? 0,
    data: serializeRecordData(record),
  };
}

function serializeRecordData(record: dnsPacket.Answer): unknown {
  switch (record.type) {
    case 'A':
    case 'AAAA':
      return (record as dnsPacket.StringAnswer).data;

    case 'CNAME':
    case 'NS':
    case 'PTR':
      return (record as dnsPacket.StringAnswer).data;

    case 'MX':
      return (record as dnsPacket.MxAnswer).data;

    case 'TXT': {
      const txtData = (record as dnsPacket.TxtAnswer).data;
      if (Array.isArray(txtData)) {
        return txtData.map((entry) => (entry instanceof Buffer ? entry.toString('utf-8') : String(entry)));
      }
      return txtData instanceof Buffer ? txtData.toString('utf-8') : String(txtData);
    }

    case 'SOA':
      return (record as dnsPacket.SoaAnswer).data;

    case 'SRV':
      return (record as dnsPacket.SrvAnswer).data;

    case 'CAA':
      return (record as dnsPacket.CaaAnswer).data;

    default:
      return (record as { data?: unknown }).data ?? null;
  }
}

/**
 * DNS wire format 헤더에서 RCODE 추출 (하위 4비트 of byte[3])
 */
function extractRcode(buf: Buffer): number {
  if (buf.length < 4) {
    return 2;
  }
  return buf[3]! & 0x0f;
}

export { DNS_RECORD_TYPES };
