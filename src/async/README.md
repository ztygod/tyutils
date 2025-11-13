# AsyncScheduler

一个轻量级、可扩展的 **异步任务调度器**，用于在浏览器或 Node.js 环境中安全高效地执行异步任务。
支持 **并发控制、优先级队列、重试、超时、暂停/恢复、事件监听** 等功能。

---

## 特性

- **并发控制**：同时运行的任务数可配置
- **任务优先级**：高优先级任务优先执行
- **重试机制**：任务失败自动重试
- **超时控制**：限制任务最长执行时间
- **暂停 / 恢复**：可临时暂停任务分发
- **事件系统**：监听任务执行的生命周期事件
- **通用接口**：支持异步函数、Promise、或普通函数

---

## 安装

```bash
npm install tyutils
# or
pnpm add tyutils
```

---

## 使用示例

```ts
import { AsyncScheduler } from "tyutils";

// 创建一个调度器，限制最多同时执行 3 个任务
const scheduler = new AsyncScheduler({ concurrency: 3 });

async function fetchUser(id: number) {
  const res = await fetch(`https://jsonplaceholder.typicode.com/users/${id}`);
  return res.json();
}

// 添加任务
for (let i = 1; i <= 10; i++) {
  scheduler.add(() => fetchUser(i), { priority: i % 2 === 0 ? 1 : 2 });
}

// 监听事件
scheduler.on("start", (id) => console.log(`任务 ${id} 开始执行`));
scheduler.on("success", (id, result) =>
  console.log(`任务 ${id} 成功`, result.name)
);
scheduler.on("error", (id, error) => console.error(`任务 ${id} 失败`, error));
scheduler.on("finish", () => console.log("✅ 所有任务完成"));

// 开始执行
scheduler.start();
```

---

## API 文档

### `new TaskScheduler(options?: SchedulerOptions)`

创建一个调度器实例。

**参数：**

| 参数                  | 类型      | 说明                                     |
| --------------------- | --------- | ---------------------------------------- |
| `options.concurrency` | `number`  | 最大并发任务数（默认：`5`）              |
| `options.retry`       | `number`  | 最大重试次数（默认：`0`）                |
| `options.timeout`     | `number`  | 单个任务超时时间（毫秒）                 |
| `options.autoStart`   | `boolean` | 是否在添加任务后自动启动（默认：`true`） |

---

### `.add(task, options?)`

向调度器添加一个任务。

**参数：**

| 参数               | 类型                 | 说明                           |
| ------------------ | -------------------- | ------------------------------ |
| `task`             | `() => Promise<any>` | 任务函数                       |
| `options.priority` | `number`             | 优先级（数值越大优先级越高）   |
| `options.retry`    | `number`             | 此任务的重试次数（可覆盖全局） |
| `options.timeout`  | `number`             | 此任务的超时（可覆盖全局）     |

**返回：** `taskId: string`

### `.start()`

开始执行任务队列。

### `.pause()`

暂停任务调度（不会中断正在执行的任务）。

### `.resume()`

恢复任务调度。

### `.clear()`

清空所有待执行任务。

### `.on(event, callback)`

注册任务生命周期事件。

**事件类型：**

| 事件名      | 回调参数           | 描述             |
| ----------- | ------------------ | ---------------- |
| `"start"`   | `(taskId)`         | 任务开始执行     |
| `"success"` | `(taskId, result)` | 任务执行成功     |
| `"error"`   | `(taskId, error)`  | 任务执行失败     |
| `"finish"`  | `()`               | 所有任务执行完成 |
| `"pause"`   | `()`               | 调度器被暂停     |
| `"resume"`  | `()`               | 调度器恢复执行   |

---

## ⚡ 性能建议

- 批量任务时，合理设置 `concurrency` 避免阻塞主线程
- 对网络任务可使用优先级区分 IO / CPU 任务
- 配合浏览器 `requestIdleCallback` 使用可进一步优化性能

## 🧭 路线图（Roadmap）

### v0.1 基础版本

- [x] 并发数控制
- [x] 任务优先级
- [x] 重试与超时机制
- [x] 暂停 / 恢复 / 事件监听

### v0.2 稳定增强

- [ ] 支持 **任务取消（AbortController）**
- [ ] 支持 **任务分组与标签（group / tag）**
- [ ] 添加 **任务状态统计（getStats）**
- [ ] 内置 **任务执行日志系统**
- [ ] 增加 **任务依赖（dependsOn）**

### v0.3 数据持久化

- [ ] IndexedDB / LocalStorage 持久化队列
- [ ] 自动恢复未完成任务
- [ ] 支持持久任务 ID 与状态查询
- [ ] 提供 `.save()` 与 `.restore()` 接口

### v0.4 高级特性

- [ ] 动态调整任务优先级
- [ ] 分组暂停、恢复与清除
- [ ] 支持 Worker / Web Worker 执行
- [ ] 插件系统（自定义中间件 / Hook）

### v1.0 企业级版本（Enterprise Edition）

- [ ] Redis / SQLite 后端持久化
- [ ] 分布式多实例调度
- [ ] 可观测性与 Metrics 接口
- [ ] Dashboard 可视化监控界面
- [ ] SDK 集成（Browser + Node）

---

## 未来构想（Vision）

`ty-scheduler` 将不仅仅是一个异步任务队列。
它将发展为一个 **可插拔的任务编排系统（Task Orchestrator）**，
帮助开发者在前端和服务端安全、高效地执行复杂异步流程。

- 统一异步任务模型
- 可视化任务状态与统计
- 支持本地与云端任务调度
- 支持自定义插件与中间件扩展
