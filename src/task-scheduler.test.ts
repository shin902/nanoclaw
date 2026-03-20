import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const testDataDir = vi.hoisted(
  () =>
    `/tmp/nanoclaw-scheduler-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
);

vi.mock('./config.js', async () => {
  const actual =
    await vi.importActual<typeof import('./config.js')>('./config.js');
  return {
    ...actual,
    DATA_DIR: testDataDir,
  };
});

import {
  _resetSchedulerLoopForTests,
  computeNextRun,
  startSchedulerLoop,
} from './task-scheduler.js';
import { saveActiveTasks } from './store.js';

describe('task scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    saveActiveTasks([]);
    _resetSchedulerLoopForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('pauses due tasks with invalid group folders to prevent retry churn', async () => {
    saveActiveTasks([
      {
        id: 'task-invalid-folder',
        group_folder: '../../outside',
        chat_jid: 'bad@g.us',
        prompt: 'run',
        schedule_type: 'once',
        schedule_value: '2026-02-22T00:00:00.000Z',
        context_mode: 'isolated',
        next_run: new Date(Date.now() - 60_000).toISOString(),
        last_run: null,
        last_result: null,
        status: 'active',
        created_at: '2026-02-22T00:00:00.000Z',
      },
    ]);

    startSchedulerLoop({
      queue: { enqueueTask: vi.fn((_jid, _taskId, fn) => void fn()) } as any,
      onProcess: () => {},
      sendMessage: async () => {},
    });

    await vi.advanceTimersByTimeAsync(10);

    const [task] = (await import('./store.js')).loadActiveTasks();
    expect(task?.status).toBe('paused');
  });

  it('computeNextRun anchors interval tasks to scheduled time to prevent drift', () => {
    const scheduledTime = new Date(Date.now() - 2000).toISOString();
    const task = {
      id: 'drift-test',
      group_folder: 'test',
      chat_jid: 'test@g.us',
      prompt: 'test',
      schedule_type: 'interval' as const,
      schedule_value: '60000',
      context_mode: 'isolated' as const,
      next_run: scheduledTime,
      last_run: null,
      last_result: null,
      status: 'active' as const,
      created_at: '2026-01-01T00:00:00.000Z',
    };

    const nextRun = computeNextRun(task);
    expect(nextRun).not.toBeNull();
    expect(new Date(nextRun!).getTime()).toBe(
      new Date(scheduledTime).getTime() + 60000,
    );
  });
});
