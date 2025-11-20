import type { UploadedChunks } from "../common/type";
import { BrowserRequester } from "./api/requester";
import type { Chunk, InitOptions } from "./type";

export class BigUploader {
  private _endpoint: string;
  private _chunkSize: number;
  private _concurrency: number;
  private _retry: number;
  private _timeout: number;
  private _header: Record<string, string>;
  private _autoStart: boolean;
  private _metadata: Record<string, any>;

  // 用户自定义的计算 hash 的函数
  private _computeHash: ((file: File | Blob) => Promise<string>) | null;

  // 网络请求实例
  private requester = new BrowserRequester();

  constructor({
    endpoint,
    chunkSize = 5 * 1024 * 1024,
    concurrency = 3,
    retry = 3,
    timeout = 30000,
    header = {},
    autoStart = false,
    computeHash = null,
    metadata = {},
  }: InitOptions) {
    if (!endpoint) throw new Error("endpoint must be provided");

    this._endpoint = endpoint;
    this._chunkSize = chunkSize;
    this._concurrency = concurrency;
    this._retry = retry;
    this._timeout = timeout;
    this._header = header;
    this._autoStart = autoStart;
    this._computeHash = computeHash;
    this._metadata = metadata;
  }

  public async upload(file: File | Blob, metadata: Record<string, any>) {
    const fileId = await this._computeFileId(file); // 计算文件唯一 Hash 值，用于断点续传

    const chunks = this._createChunks(file); // 文件分片
    const uploadedChunks = await this._getUploadedChunks(fileId); // 获取已上传的分片索引

    const pendingChunks = chunks.filter(
      (chunk) => !uploadedChunks.has(chunk.index)
    );

    await this._uploadChunksConcurrently(pendingChunks); // 并发上传

    await this._mergeChunks(fileId, chunks.length, metadata); // 通知后端合并
  }

  // 文件唯一标识
  private async _computeFileId(
    file: File | Blob,
    algorithm: AlgorithmIdentifier = "SHA-256"
  ): Promise<string> {
    if (this._computeHash) {
      return await this._computeHash(file);
    }

    const chunkSize = 2 * 1024 * 1024; // 采样 2MB
    const chunks = [];
    const fileSize = file.size;
    const middle = Math.floor(fileSize / 2);

    // 选区头、中、尾三个位置
    chunks.push(file.slice(0, chunkSize));
    if (fileSize > chunkSize * 2) {
      chunks.push(file.slice(middle, middle + chunkSize));
    }
    if (fileSize > chunkSize) {
      chunks.push(file.slice(fileSize - chunkSize, fileSize));
    }

    // 拼接成统一的 ArrayBuffer
    const fileBuffers = await Promise.all(
      chunks.map((chunk) => chunk.arrayBuffer())
    );
    const concatBuffer = this._concatBuffer(fileBuffers);

    const hashBuffer = await crypto.subtle.digest(algorithm, concatBuffer);
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return `${hashHex}_${fileSize}`;
  }

  // 多 Buffer 合并
  private _concatBuffer(buffers: ArrayBuffer[]): ArrayBuffer {
    const length = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
    const tmp = new Uint8Array(length);
    let pos = 0;
    for (const buf of buffers) {
      tmp.set(new Uint8Array(buf), pos);
      pos += buf.byteLength;
    }
    return tmp.buffer;
  }

  // 文件分片
  private _createChunks(file: File | Blob): Chunk[] {
    const chunks: Chunk[] = [];
    let start = 0;
    let index = 0;

    while (start < file.size) {
      const end = Math.min(start + this._chunkSize, file.size);
      chunks.push({
        index,
        start,
        end,
        blob: file.slice(start, end),
      });
      start = end;
      index++;
    }

    return chunks;
  }

  // 查询已上传的文件分片
  private async _getUploadedChunks(fileId: string): Promise<Set<number>> {
    const url = `${this._endpoint}/status?fileId=${encodeURIComponent(fileId)}`;

    for (let attempt = 0; attempt < this._retry; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this._timeout);

        const res = await this.requester.request<UploadedChunks>(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            ...this._header,
          },
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!Array.isArray(res.uploaded)) {
          throw new Error("Incorrect response format");
        }

        return new Set(res.uploaded);
      } catch (err) {
        console.warn(`[getUploadedChunks] attempt ${attempt + 1} failed:`, err);

        if (attempt === this._retry - 1) {
          // 放弃断点续传，重新上传
          return new Set();
        }
      }
    }
    return new Set();
  }

  // 并发上传文件分片
  private async _uploadChunksConcurrently(chunks: Chunk[]): Promise<void> {
    const url = `${this._endpoint}/upload`;

    let running = 0;
    let completed = 0;

    return new Promise((resolve, reject) => {
      const tryUpload = async () => {
        if (completed === chunks.length) {
          if (running === 0) resolve(); // 全部完成
          return;
        }

        if (running >= this._concurrency) return;

        const chunk = chunks.shift();
        if (!chunk) return;

        running++;

        for (let attempt = 0; attempt < this._retry; attempt++) {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), this._timeout);

            await this.requester.uploadChunk(url, chunk.blob, {
              method: "POST",
              headers: {
                ...this._header,
              },
              signal: controller.signal,
            });

            clearTimeout(timeout);
            completed++;
            running--;

            tryUpload(); // 继续调度
            return;
          } catch (err) {
            if (attempt + 1 === this._retry) {
              reject(new Error(`Chunk ${chunk.index} failed over retry`));
              return;
            }
          }
        }
      };

      // 启动并发管控
      for (let i = 0; i < this._concurrency; i++) {
        tryUpload();
      }
    });
  }

  // 通知后端进行合并
  private async _mergeChunks(
    fileId: string,
    chunkLength: number,
    metadata: Record<string, any>
  ) {}
}
