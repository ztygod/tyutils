# BigUploader

> 一个轻量、高性能、支持分片与断点续传的大文件上传工具库，支持浏览器和 Node.js。

---

## **特性**

- ✅ **分片上传**：自动将大文件切分为小分片，提高上传可靠性
- ✅ **并发上传**：多分片并行上传，提升上传速度
- ✅ **断点续传**：上传中断可恢复，支持浏览器刷新、网络波动
- ✅ **进度管理**：支持整体与分片进度监控
- ✅ **暂停 / 恢复 / 取消**：灵活控制上传任务
- ✅ **重试机制**：分片上传失败可自动重试
- ✅ **完整性校验**：支持每片和整体校验（MD5/SHA1）
- ✅ **灵活 API**：可配置分片大小、并发数、重试次数
- ✅ **多文件上传**：支持文件队列，顺序或并发上传多个文件
- ✅ **浏览器 & Node.js**：兼容主流浏览器与 Node.js 环境

---

## **核心理念**

- **任务管理**：每个上传文件都是一个任务，可暂停/恢复/取消/查询状态
- **事件丰富**：分片上传、整体进度、错误、完成、重试等全覆盖
- **扩展性**：支持 token、文件元信息、上传策略、动态分片大小
- **可监控**：提供文件级和分片级日志/状态，可方便后台统计

---

## **快速开始**

```ts
import { BigUploader } from "big-uploader";

// 初始化上传器
const uploader = new BigUploader({
  chunkSize: 5 * 1024 * 1024, // 分片大小 5MB
  concurrency: 3, // 最大并发数
  retry: 3, // 每片最大重试次数
  endpoint: "https://yourserver.com/upload", // 上传接口
});

// 监听进度
uploader.on("progress", (fileId, progress) => {
  console.log(`文件 ${fileId} 上传进度: ${progress}%`);
});

uploader.on("complete", (fileId) => {
  console.log(`文件 ${fileId} 上传完成`);
});

uploader.on("error", (fileId, error) => {
  console.error(`文件 ${fileId} 上传失败`, error);
});

// 上传文件
const fileInput = document.querySelector<HTMLInputElement>("#fileInput");
fileInput.addEventListener("change", async () => {
  if (!fileInput.files) return;
  const file = fileInput.files[0];
  const fileId = await uploader.upload(file);
  console.log("上传任务已提交, 文件ID:", fileId);
});

// 暂停 / 恢复 / 取消
// uploader.pause(fileId);
// uploader.resume(fileId);
// uploader.cancel(fileId);
```

---

## **初始化与配置**

```ts
import { BigUploader } from "big-uploader";

const uploader = new BigUploader({
  endpoint: "https://api.company.com/upload",
  chunkSize: 5 * 1024 * 1024, // 默认 5MB
  concurrency: 4, // 并发上传数
  retry: 5, // 分片重试次数
  timeout: 30_000, // 单片超时时间 ms
  headers: {
    Authorization: "Bearer <token>",
  },
  autoStart: false, // 是否自动开始上传
});
```

### **配置项说明**

| 参数          | 类型                              | 默认值   | 描述                                     |
| ------------- | --------------------------------- | -------- | ---------------------------------------- |
| `endpoint`    | `string`                          | -        | 上传接口 URL                             |
| `chunkSize`   | `number`                          | 5MB      | 分片大小，可根据网络/文件大小调整        |
| `concurrency` | `number`                          | 3        | 最大并发数                               |
| `retry`       | `number`                          | 3        | 分片失败重试次数                         |
| `timeout`     | `number`                          | 30_000   | 单片上传超时时间（ms）                   |
| `headers`     | `Record<string,string>`           | `{}`     | 请求 headers，可传 token/签名/自定义参数 |
| `autoStart`   | `boolean`                         | `true`   | 是否自动开始上传                         |
| `computeHash` | `(file: File) => Promise<string>` | 内置 MD5 | 文件唯一标识生成函数，用于断点续传       |
| `metadata`    | `Record<string,any>`              | `{}`     | 上传文件额外信息，可用于后端记录         |

---

## **文件上传 API**

### **1. 上传文件**

```ts
const fileId = await uploader.upload(file, {
  metadata: { projectId: "123", userId: "456" },
});
```

**参数说明**：

- `file`：`File | Blob | Node.js Stream`
- `metadata`：可选，额外文件信息
- 返回 `fileId`：唯一上传任务标识

---

### **2. 控制上传任务**

| 方法                | 参数    | 描述                                                             |
| ------------------- | ------- | ---------------------------------------------------------------- |
| `pause(fileId)`     | 文件 ID | 暂停任务                                                         |
| `resume(fileId)`    | 文件 ID | 恢复任务                                                         |
| `cancel(fileId)`    | 文件 ID | 取消任务                                                         |
| `retry(fileId)`     | 文件 ID | 手动重试失败的分片                                               |
| `getStatus(fileId)` | 文件 ID | 获取任务状态 `{ progress, status, uploadedChunks, totalChunks }` |
| `listTasks()`       | -       | 返回所有上传任务的状态列表                                       |

**任务状态枚举**：

```ts
type UploadStatus =
  | "pending"
  | "uploading"
  | "paused"
  | "completed"
  | "failed"
  | "canceled";
```

---

### **3. 事件机制**

```ts
uploader.on("progress", (fileId, progress) => {
  /* 总进度 */
});
uploader.on("chunkProgress", (fileId, chunkIndex, chunkProgress) => {
  /* 分片进度 */
});
uploader.on("complete", (fileId) => {
  /* 文件完成 */
});
uploader.on("chunkUploaded", (fileId, chunkIndex) => {
  /* 分片上传成功 */
});
uploader.on("error", (fileId, error) => {
  /* 文件上传失败 */
});
uploader.on("retry", (fileId, chunkIndex, attempt) => {
  /* 分片重试 */
});
```

> 企业场景中，`chunkProgress`、`retry` 和 `error` 事件非常重要，可以用于日志/监控和可视化大屏。

---

### **4. 多文件上传（队列管理）**

```ts
const files = fileInput.files;
for (const file of files) {
  uploader.upload(file, { metadata: { projectId: "123" } });
}

// 监听所有任务完成
uploader.on("complete", (fileId) => {
  console.log("文件完成:", fileId);
});
```

- 支持顺序或并发上传
- 可通过 `concurrency` 配置控制并发任务数
- 队列中任务状态可查询 `listTasks()`

---

### **5. 分片完整性校验**

- 支持每片 hash 校验
- 支持整文件 hash 校验（断点续传、校验文件完整性）
- 后端可返回 `uploadedChunks`，客户端自动跳过已上传分片

---

### **6. 高级企业化功能**

- **上传策略**：可为不同文件类型/大小动态调整分片大小、并发数
- **权限控制**：支持带 token/签名上传，结合 metadata
- **日志监控**：事件全量记录，可接入 ELK/Kafka/内部监控系统
- **断点续传策略**：

  - 通过 file hash + 文件名 + 文件大小生成唯一标识
  - 客户端可向后端查询已上传分片列表

---

### **服务端接口建议（企业化）**

**1. 分片上传接口**：

```http
POST /upload
Headers:
  Authorization: Bearer <token>
  X-File-Id: <fileId>
  X-Chunk-Index: <chunkIndex>
  X-Total-Chunks: <totalChunks>
Body:
  file: <分片内容>
  metadata: { projectId, userId, ... }
```

**2. 合并分片接口**：

```http
POST /merge
Body:
{
  fileId: "<fileId>",
  filename: "bigfile.zip",
  totalChunks: 10,
  metadata: { projectId: "123" }
}
```

**3. 查询已上传分片**：

```http
GET /uploaded-chunks?fileId=<fileId>
```

> 这个接口配合断点续传非常关键。
