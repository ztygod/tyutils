export interface InitOptions {
  endpoint: string;
  chunkSize?: number;
  concurrency?: number;
  retry?: number;
  timeout?: number;
  header?: Record<string, string>;
  autoStart?: boolean;
  computeHash?: ((file: File | Blob) => Promise<string>) | null;
  metadata?: Record<string, any>;
}

export interface Chunk {
  index: number;
  start: number;
  end: number;
  blob: Blob;
}
