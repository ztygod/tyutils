export interface Requester {
  get<T = any>(url: string, signal?: AbortSignal): Promise<T>;
  post<T = any>(
    url: string,
    data: any,
    headers?: Record<string, string>,
    signal?: AbortSignal
  ): Promise<T>;
  uploadChunk<T = any>(
    url: string,
    chunk: Blob,
    headers?: Record<string, string>,
    signal?: AbortSignal
  ): Promise<T>;
}

export interface UploadedChunks {
  uploaded: number[];
  totalChunks: number;
}
