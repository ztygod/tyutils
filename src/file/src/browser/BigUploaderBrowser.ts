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

  // 文件唯一标识
  private _fileId: string = "";

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
    this._computeHash = computeHash;
  }

  public async upload(file: File | Blob, metadata: Record<string, any>) {
    const fileId = await this._computeFileId(file); // 计算文件唯一 Hash 值，用于断点续传
    this._fileId = fileId;

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

  private async _getUploadedChunks(fileId: string): Promise<Set<number>> {
    const url = `${this._endpoint}/status?fileId=${encodeURIComponent(fileId)}`;

    for (let attempt = 0; attempt < this._retry; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this._timeout);

        const res = await this.requester.get<UploadedChunks>(
          url,
          controller.signal
        );

        clearTimeout(timeout);

        if (!Array.isArray(res.uploaded)) {
          throw new Error("Incorrect response format");
        }

        return new Set(res.uploaded);
      } catch (err) {
        console.warn(`[getUploadedChunks] attempt ${attempt + 1} failed:`, err);

        if (attempt === this._retry - 1) {
          return new Set(); // 放弃断点续传，重新上传
        }
      }
    }

    return new Set();
  }

  private async _uploadChunksConcurrently(chunks: Chunk[]): Promise<void> {
    const url = `${this._endpoint}/upload`;
    const total = chunks.length;
    let completed = 0;
    let failed = false;

    const uploadChunk = async (chunk: Chunk) => {
      for (let attempt = 0; attempt < this._retry; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this._timeout);

        try {
          await this.requester.uploadChunk(
            `${url}?fileId=${this._fileId}&index=${chunk.index}`,
            chunk.blob,
            this._header,
            controller.signal
          );

          completed++;
          return;
        } catch (error) {
          if (attempt + 1 === this._retry) {
            failed = true;
            throw new Error(
              `Chunk ${chunk.index} failed after ${attempt} attempts.`
            );
          }
        } finally {
          clearTimeout(timeout);
        }
      }
    };

    const pool: Promise<void>[] = [];
    let idx = 0;

    const runNext = async () => {
      if (failed || idx > this._concurrency) return;
      const task = uploadChunk(chunks[idx++]).then(runNext);
      pool.push(task);
    };

    const size = Math.min(this._concurrency, total);
    for (let i = 0; i < size; i++) runNext();
    await Promise.all(pool);
  }

  private async _mergeChunks(
    fileId: string,
    chunkLength: number,
    metadata: Record<string, any>
  ) {
    const url = `${this._endpoint}/merge`;
    return this.requester.post(url, { fileId, chunkLength, metadata });
  }
}
