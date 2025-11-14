import { v4 as uuidv4 } from "uuid";

export interface AsyncSchedulerOptions {
  concurrency?: number; // 最大并发任务数
  retry?: number; // 最多重试次数
  timeout?: number; // 单个任务超时时间
  autoStart?: boolean; // 是否在添加任务后自动启动
}

export interface AddTaskOptions {
  priority?: number; // 优先级（数值越大优先级越高）
  retry?: number; // 此任务的重试次数（可覆盖全局）
  timeout?: number; // 此任务的超时（可覆盖全局）
  signal?: AbortSignal; // 可取消任务
}

export interface Task {
  id: string;
  fn: () => Promise<any>;
  options: Required<AddTaskOptions>;
  attempt: number;
  controller: AbortController;
}

export type EventType = "start" | "success" | "error" | "retry" | "finish";

/**
 * 异步任务调度器
 */
export class AsyncScheduler {
  private _concurrency: number;
  private _retry: number;
  private _timeout: number;
  private _autoStart: boolean;

  private _running = 0; // 当前运行中的任务数
  private _taskQuene: Task[] = []; // 等待队列
  private _tasks: Map<string, Task> = new Map(); //所有任务

  private _events: Map<EventType, Function[]> = new Map();

  // 标志位
  private _paused = false;
  private _started: any;

  constructor(options?: AsyncSchedulerOptions) {
    this._concurrency = options?.concurrency ?? 5;
    this._retry = options?.retry ?? 0;
    this._timeout = options?.timeout ?? 0;
    this._autoStart = options?.autoStart ?? false;
  }

  public addTask(fn: () => Promise<any>, options?: AddTaskOptions): string {
    const id = uuidv4();
    const controller = new AbortController();
    const task: Task = {
      id,
      fn,
      attempt: 0,
      controller,
      options: {
        priority: options?.priority ?? 0,
        retry: options?.retry ?? 0,
        timeout: options?.timeout ?? this._timeout,
        signal: options?.signal ?? new AbortController().signal,
      },
    };

    this._tasks.set(id, task);
    this._taskQuene.push(task);
    this._taskQuene.sort((a, b) => b.options.priority - a.options.priority);

    if (this._autoStart) {
      this._runNext();
    }

    return id;
  }

  public start() {
    // 防止重复启动
    if (this._started) return;
    this._started = true;

    // 启动最多 this._concurrency 个任务并发执行
    for (let i = 0; i < this._concurrency; i++) {
      this._runNext();
    }
  }

  private async _runNext() {
    if (this._paused) return;
    if (this._running >= this._concurrency) return;
    const task = this._taskQuene.shift();

    if (!task) {
      if (this._running === 0) {
        this._emit("finish");
      }
      return;
    }

    this._running++;
    this._emit("start", task.id);

    try {
      const result = await this._executeTask(task);
      this._emit("success", task.id, result);
    } catch (err) {
      if (task.attempt < this._retry || task.options.retry) {
        task.attempt++;
        this._emit("retry", task.id, task.attempt, err);
        this._taskQuene.unshift(task); // 重试放回队列
      } else {
        this._emit("error", task.id, err);
      }
    } finally {
      this._running--;
      this._runNext();
    }
  }

  private _executeTask(task: Task): Promise<any> {
    const { fn, options } = task;
    const { timeout, signal } = options;

    if (signal.aborted) {
      return Promise.reject(new Error("Task Cancelled"));
    }

    let timeoutPromise: Promise<any> | null = null;
    if (timeout > 0) {
      timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), timeout)
      );
      // 如果有超时设置，使用 Promise.race
      return Promise.race([fn(), timeoutPromise]);
    }

    // 没有超时设置，直接返回
    return fn();
  }

  // 停止取新任务，但不终止已运行任务
  public pause() {
    this._paused = true;
  }

  // 继续调度队列
  public resume() {
    if (!this._paused) return;
    this._paused = false;

    const slots = this._concurrency - this._running;
    for (let i = 0; i < slots; i++) {
      this._runNext();
    }
  }

  // 取消指定任务
  public cancelTask(id: string) {
    const task = this._tasks.get(id);
    if (!task) return;

    // 从队列删除
    const index = this._taskQuene.indexOf(task);
    if (index > -1) {
      this._taskQuene.splice(index, 1);
      this._tasks.delete(id);
      return;
    }

    // 如果正在运行，使用 controller 取消
    task.controller.abort();
  }

  public abortAll() {}

  // 注册生命周期事件
  public on(event: EventType, callback: Function) {
    if (!this._events.has(event)) this._events.set(event, []);
    this._events.get(event)!.push(callback);
  }

  private _emit(event: EventType, ...args: any[]) {
    const listeners = this._events.get(event);
    if (listeners) {
      listeners.forEach((cb) => cb(...args));
    }
  }
}
