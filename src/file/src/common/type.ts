export interface UploadRequestInit {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: any;
  signal?: AbortSignal;
}

export interface Requester {
  request<T = any>(url: string, config?: UploadRequestInit): Promise<T>;

  uploadChunk<T = any>(
    url: string,
    chunk: Blob,
    config?: UploadRequestInit
  ): Promise<T>;
}

export interface UploadedChunks {
  uploaded: number[];
  totalChunks: number;
}
