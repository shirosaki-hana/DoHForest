import net from 'node:net';
import { logger } from '../logger/index.js';
import { handleDnsQuery } from './handler.js';
//------------------------------------------------------------------------------//

const MAX_TCP_CONNECTIONS = 100;
const MAX_TCP_BUFFER_BYTES = 128 * 1024; // 128 KB

let server: net.Server | null = null;

/**
 * TCP DNS 서버 시작
 *
 * DNS over TCP (RFC 1035 4.2.2):
 * 각 메시지 앞에 2바이트 Big-Endian 길이 프리픽스가 붙음
 */
export function startTcpServer(host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server = net.createServer((socket) => {
      let buffer = Buffer.alloc(0);
      let draining = false;

      async function drainBuffer(): Promise<void> {
        draining = true;
        while (buffer.length >= 2) {
          const msgLength = buffer.readUInt16BE(0);
          if (buffer.length < 2 + msgLength) {
            break;
          }

          const dnsMessage = buffer.subarray(2, 2 + msgLength);
          buffer = buffer.subarray(2 + msgLength);

          try {
            const response = await handleDnsQuery(Buffer.from(dnsMessage));
            const lengthPrefix = Buffer.alloc(2);
            lengthPrefix.writeUInt16BE(response.length, 0);
            socket.write(Buffer.concat([lengthPrefix, response]));
          } catch (error) {
            logger.error('dns', 'TCP handler error', {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
        draining = false;
      }

      socket.on('data', (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);

        if (buffer.length > MAX_TCP_BUFFER_BYTES) {
          logger.warn('dns', 'TCP buffer limit exceeded, dropping connection');
          socket.destroy();
          return;
        }

        if (!draining) {
          drainBuffer().catch((error) => {
            logger.error('dns', 'TCP drain error', {
              error: error instanceof Error ? error.message : String(error),
            });
          });
        }
      });

      socket.on('error', (err) => {
        logger.error('dns', 'TCP client connection error', {
          error: err.message,
        });
      });

      socket.setTimeout(10_000, () => {
        socket.destroy();
      });
    });

    server.maxConnections = MAX_TCP_CONNECTIONS;

    server.on('error', (err) => {
      logger.error('dns', 'TCP server error', { error: err.message });
      if (!server?.listening) {
        reject(err);
      }
    });

    server.listen(port, host, () => {
      logger.info('dns', `TCP server listening on ${host}:${port}`);
      resolve();
    });
  });
}

/**
 * TCP DNS 서버 종료
 */
export function stopTcpServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    server.close(() => {
      server = null;
      resolve();
    });
  });
}
