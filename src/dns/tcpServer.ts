import net from 'node:net';
import { logger } from '../logger/index.js';
import { handleDnsQuery } from './handler.js';
//------------------------------------------------------------------------------//

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
      let buffer: Uint8Array = Buffer.alloc(0);

      socket.on('data', (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        processBuffer(socket, Buffer.from(buffer)).then((remaining) => {
          buffer = remaining;
        });
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
 * TCP 버퍼에서 length-prefixed DNS 메시지를 추출하여 처리
 */
async function processBuffer(socket: net.Socket, buffer: Buffer): Promise<Buffer> {
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

  return buffer;
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
