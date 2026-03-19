export class RateLimiter {
  private intervalMs: number;
  private lastRequestTime = 0;

  constructor(requestsPerMinute: number) {
    this.intervalMs = 60_000 / requestsPerMinute;
  }

  async acquire(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;

    if (elapsed >= this.intervalMs) {
      this.lastRequestTime = now;
      return;
    }

    const waitMs = this.intervalMs - elapsed;
    await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    this.lastRequestTime = Date.now();
  }
}
