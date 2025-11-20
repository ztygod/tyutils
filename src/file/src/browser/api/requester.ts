import type { Requester, UploadRequestInit } from "../../common/type";

export class BrowserRequester implements Requester {
  async request<T = any>(url: string, config?: UploadRequestInit): Promise<T> {
    const res = await fetch(url, {
      method: config?.method || "GET",
      headers: config?.headers,
      body: config?.body,
      signal: config?.signal,
    });

    if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
    return res.json() as Promise<T>;
  }

  async uploadChunk<T = any>(
    url: string,
    chunk: Blob,
    config?: UploadRequestInit
  ): Promise<T> {
    const formData = new FormData();
    formData.append("chunk", chunk);

    const res = await fetch(url, {
      method: config?.method || "POST",
      headers: config?.headers,
      body: formData,
      signal: config?.signal,
    });

    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    return res.json() as Promise<T>;
  }
}
