import dgram from 'node:dgram';
import { logger } from '../logger/index.js';
import { handleDnsQuery } from './handler.js';
//------------------------------------------------------------------------------//

let socket: dgram.Socket | null = null;

/**
 * UDP DNS 서버 시작
 */
export function startUdpServer(host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    socket = dgram.createSocket('udp4');
    let bound = false;

    socket.on('message', (msg, rinfo) => {
      handleDnsQuery(msg)
        .then((response) => {
          socket?.send(response, rinfo.port, rinfo.address, (err) => {
            if (err) {
              logger.warn('dns', 'UDP send failed', {
                error: err.message,
                client: `${rinfo.address}:${rinfo.port}`,
              });
            }
          });
        })
        .catch((error) => {
          logger.error('dns', 'UDP handler error', {
            error: error instanceof Error ? error.message : String(error),
            client: `${rinfo.address}:${rinfo.port}`,
          });
        });
    });

    socket.on('error', (err) => {
      logger.error('dns', 'UDP server error', { error: err.message });
      if (!bound) {
        reject(err);
      }
    });

    socket.bind(port, host, () => {
      bound = true;
      logger.info('dns', `UDP server listening on ${host}:${port}`);
      resolve();
    });
  });
}

/**
 * UDP DNS 서버 종료
 */
export function stopUdpServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!socket) {
      resolve();
      return;
    }
    socket.close(() => {
      socket = null;
      resolve();
    });
  });
}
