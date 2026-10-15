export interface SingleFlightGuard {
  current: boolean;
}

export async function runSingleFlight<T>(
  guard: SingleFlightGuard,
  action: () => Promise<T>,
): Promise<T | undefined> {
  if (guard.current) return undefined;
  guard.current = true;
  try {
    return await action();
  } finally {
    guard.current = false;
  }
}

export interface LatestTask {
  signal: AbortSignal;
  isCurrent: () => boolean;
}

export class LatestTaskCoordinator {
  private version = 0;
  private controller: AbortController | null = null;

  start(): LatestTask {
    this.controller?.abort();
    const controller = new AbortController();
    const version = ++this.version;
    this.controller = controller;
    return {
      signal: controller.signal,
      isCurrent: () => this.version === version && !controller.signal.aborted,
    };
  }

  cancel(): void {
    this.controller?.abort();
    this.controller = null;
    this.version++;
  }
}
