import type { Requester } from "../../common/type";

export class BrowserRequester implements Requester {
  async get<T = any>(url: string, signal?: AbortSignal): Promise<T> {
    const res = await fetch(url, { signal });
    return res.json();
  }
  async post<T = any>(
    url: string,
    data: any,
    headers?: Record<string, string>,
    signal?: AbortSignal
  ): Promise<T> {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(data),
      signal,
    });

    return res.json();
  }
  async uploadChunk<T = any>(
    url: string,
    chunk: Blob,
    headers?: Record<string, string>,
    signal?: AbortSignal
  ): Promise<T> {
    const res = await fetch(url, {
      method: "POST",
      headers,
      signal,
      body: chunk,
    });

    return res.json();
  }
}
