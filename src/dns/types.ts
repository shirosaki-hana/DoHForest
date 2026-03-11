import type dgram from 'node:dgram';
import type net from 'node:net';

export interface DnsServer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface UdpRequestContext {
  socket: dgram.Socket;
  rinfo: dgram.RemoteInfo;
}

export interface TcpRequestContext {
  socket: net.Socket;
}
