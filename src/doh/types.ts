export interface DoHProvider {
  name: string;
  url: string;
}

export interface DoHQueryResult {
  responseBuffer: Buffer;
  provider: DoHProvider;
}
