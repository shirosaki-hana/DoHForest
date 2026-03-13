import http2 from 'node:http2';
//------------------------------------------------------------------------------//

interface ParsedEndpoint {
  origin: string;
  path: string;
}

const urlCache = new Map<string, ParsedEndpoint>();
const sessions = new Map<string, http2.ClientHttp2Session>();

function resolveEndpoint(url: string): ParsedEndpoint {
  let cached = urlCache.get(url);
  if (!cached) {
    const u = new URL(url);
    cached = { origin: u.origin, path: u.pathname + u.search };
    urlCache.set(url, cached);
  }
  return cached;
}

function getSession(origin: string): http2.ClientHttp2Session {
  const existing = sessions.get(origin);
  if (existing && !existing.closed && !existing.destroyed) {
    return existing;
  }

  const session = http2.connect(origin);

  const evict = () => {
    if (sessions.get(origin) === session) {
      sessions.delete(origin);
    }
  };

  session.on('error', evict);
  session.on('close', evict);
  session.on('goaway', evict);

  sessions.set(origin, session);
  return session;
}

/**
 * HTTP/2 영속 세션을 통해 DoH POST 요청 전송
 *
 * origin별로 세션을 하나씩 유지하며, 세션이 닫히거나
 * GOAWAY를 수신하면 다음 요청 시 자동으로 새 세션을 생성한다.
 */
export function request(url: string, body: Buffer, timeoutMs: number): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const { origin, path } = resolveEndpoint(url);

    let session: http2.ClientHttp2Session;
    try {
      session = getSession(origin);
    } catch {
      resolve(null);
      return;
    }

    let settled = false;
    const settle = (value: Buffer | null) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    let req: http2.ClientHttp2Stream;
    try {
      req = session.request({
        ':method': 'POST',
        ':path': path,
        'content-type': 'application/dns-message',
        accept: 'application/dns-message',
        'content-length': body.length,
      });
    } catch {
      if (sessions.get(origin) === session) {
        sessions.delete(origin);
      }
      settle(null);
      return;
    }

    req.setTimeout(timeoutMs, () => {
      req.close(http2.constants.NGHTTP2_CANCEL);
      settle(null);
    });

    let status: number | undefined;
    req.on('response', (headers) => {
      status = headers[':status'];
      if (status !== 200) {
        req.close();
        settle(null);
      }
    });

    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => settle(status === 200 ? Buffer.concat(chunks) : null));
    req.on('error', () => settle(null));

    req.end(body);
  });
}

/**
 * 모든 HTTP/2 세션 종료 (graceful shutdown)
 */
export function destroy(): void {
  for (const session of sessions.values()) {
    if (!session.closed && !session.destroyed) {
      session.close();
    }
  }
  sessions.clear();
}
