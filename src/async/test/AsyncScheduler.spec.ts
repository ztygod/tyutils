import { describe, it, expect, vi, beforeEach } from "vitest";
import { AsyncScheduler } from "../src/AsyncScheduler";

function delay(ms: number, value?: any) {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

describe("AsyncScheduler", () => {
  let scheduler: AsyncScheduler;

  beforeEach(() => {
    scheduler = new AsyncScheduler({
      concurrency: 2,
      retry: 1,
      timeout: 1000,
      autoStart: false,
    });
  });

  it("should execute tasks respecting concurrency limit", async () => {
    const results: number[] = [];

    const createTask = (id: number, time: number) => async () => {
      results.push(id);
      await delay(time);
      return id;
    };

    scheduler.addTask(createTask(1, 200));
    scheduler.addTask(createTask(2, 200));
    scheduler.addTask(createTask(3, 200));

    const startTime = Date.now();
    scheduler.start();

    // 等待所有任务结束
    await new Promise((resolve) => {
      scheduler.on("finish", resolve);
    });

    const duration = Date.now() - startTime;

    // 确认并发数限制生效（3 个任务，每次最多 2 个 -> 至少两个阶段）
    expect(duration).toBeGreaterThanOrEqual(400);
  });

  it("should execute high priority task first", async () => {
    const order: number[] = [];

    scheduler.addTask(async () => order.push(1), { priority: 1 });
    scheduler.addTask(async () => order.push(2), { priority: 5 });
    scheduler.addTask(async () => order.push(3), { priority: 3 });

    scheduler.start();

    await new Promise((resolve) => scheduler.on("finish", resolve));

    expect(order).toEqual([2, 3, 1]); // 优先级从高到低
  });

  it("should retry failed task", async () => {
    let attempt = 0;
    const task = vi.fn(async () => {
      attempt++;
      if (attempt < 2) throw new Error("fail");
      return "ok";
    });

    scheduler.addTask(task);
    scheduler.start();

    await new Promise((resolve) => scheduler.on("finish", resolve));

    expect(task).toHaveBeenCalledTimes(2);
  });

  it("should trigger timeout error", async () => {
    const task = vi.fn(async () => {
      await delay(200);
      return "done";
    });

    scheduler = new AsyncScheduler({
      concurrency: 1,
      timeout: 100,
      autoStart: true,
    });

    scheduler.addTask(task);

    const onError = vi.fn();
    scheduler.on("error", onError);

    await new Promise((resolve) => scheduler.on("finish", resolve));

    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0][1].message).toBe("Timeout");
  });

  it("should emit lifecycle events", async () => {
    const onStart = vi.fn();
    const onSuccess = vi.fn();
    const onFinish = vi.fn();

    scheduler.on("start", onStart);
    scheduler.on("success", onSuccess);
    scheduler.on("finish", onFinish);

    scheduler.addTask(async () => "task1");
    scheduler.addTask(async () => "task2");
    scheduler.start();

    await new Promise((resolve) => scheduler.on("finish", resolve));

    expect(onStart).toHaveBeenCalledTimes(2);
    expect(onSuccess).toHaveBeenCalledTimes(2);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
  it("should not run more tasks than concurrency limit at any given time", async () => {
    let runningTasks = 0;
    let maxRunningTasks = 0;

    const createTask = () => async () => {
      runningTasks++;
      maxRunningTasks = Math.max(maxRunningTasks, runningTasks); // 记录并发峰值
      await delay(100); // 模拟耗时
      runningTasks--;
    };

    // 添加 4 个任务，并发限制为 2
    scheduler.addTask(createTask());
    scheduler.addTask(createTask());
    scheduler.addTask(createTask());
    scheduler.addTask(createTask());

    scheduler.start();

    await new Promise((resolve) => scheduler.on("finish", resolve));

    // 断言：在任何时刻，同时运行的任务数都不应超过并发限制 2
    expect(maxRunningTasks).toBe(2);
  });
});
