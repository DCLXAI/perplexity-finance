import { loadConfig } from '../config.js';

export type CircuitState = 'closed' | 'open' | 'half-open' | 'disabled';
export interface CircuitSnapshot {
  readonly state: CircuitState;
  readonly failures: number;
  readonly consecutiveFailures: number;
  readonly openedAt?: string;
  readonly retryAt?: string;
  readonly nextAttemptAt?: string;
  readonly lastFailureAt?: string;
  readonly lastError?: string;
}

export class CircuitOpenError extends Error {
  constructor(readonly provider: string, readonly retryAtMs: number) {
    super(`${provider} circuit is open until ${new Date(retryAtMs).toISOString()}`);
    this.name = 'CircuitOpenError';
  }
}

export class CircuitBreaker {
  private state: Exclude<CircuitState, 'disabled'> = 'closed';
  private failures = 0;
  private openedAt?: number;
  private retryAt?: number;
  private lastFailureAt?: number;
  private lastError?: string;
  private probeInFlight = false;

  constructor(
    private readonly provider: string,
    private readonly failureThreshold: number,
    private readonly openMs: number,
  ) {}

  private transition(now: number): void {
    if (this.state === 'open' && this.retryAt !== undefined && now >= this.retryAt) {
      this.state = 'half-open';
      this.probeInFlight = false;
    }
  }

  acquire(now = Date.now()): CircuitSnapshot {
    this.transition(now);
    if (this.state === 'open') return this.snapshot(now);
    if (this.state === 'half-open') {
      if (this.probeInFlight) return Object.freeze({ ...this.snapshot(now), state: 'open' as const });
      this.probeInFlight = true;
    }
    return this.snapshot(now);
  }

  success(): CircuitSnapshot {
    this.state = 'closed';
    this.failures = 0;
    this.openedAt = undefined;
    this.retryAt = undefined;
    this.lastError = undefined;
    this.probeInFlight = false;
    return this.snapshot();
  }

  failure(error?: unknown, now = Date.now()): CircuitSnapshot {
    this.lastFailureAt = now;
    this.lastError = error instanceof Error ? error.message : error === undefined ? undefined : String(error);
    this.probeInFlight = false;
    this.failures += 1;
    if (this.state === 'half-open' || this.failures >= this.failureThreshold) {
      this.state = 'open';
      this.openedAt = now;
      this.retryAt = now + this.openMs;
    }
    return this.snapshot(now);
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const acquired = this.acquire();
    if (acquired.state === 'open') {
      throw new CircuitOpenError(this.provider, this.retryAt ?? Date.now() + this.openMs);
    }
    try {
      const value = await operation();
      this.success();
      return value;
    } catch (error) {
      this.failure(error);
      throw error;
    }
  }

  snapshot(now = Date.now()): CircuitSnapshot {
    this.transition(now);
    const retryAt = this.retryAt === undefined ? undefined : new Date(this.retryAt).toISOString();
    return Object.freeze({
      state: this.state,
      failures: this.failures,
      consecutiveFailures: this.failures,
      ...(this.openedAt === undefined ? {} : { openedAt: new Date(this.openedAt).toISOString() }),
      ...(retryAt ? { retryAt, nextAttemptAt: retryAt } : {}),
      ...(this.lastFailureAt === undefined ? {} : { lastFailureAt: new Date(this.lastFailureAt).toISOString() }),
      ...(this.lastError ? { lastError: this.lastError } : {}),
    });
  }
}

const circuits = new Map<string, CircuitBreaker>();

export function providerCircuit(provider: string): CircuitBreaker {
  const existing = circuits.get(provider);
  if (existing) return existing;
  const config = loadConfig();
  const created = new CircuitBreaker(provider, config.providerFailureThreshold, config.providerCircuitOpenMs);
  circuits.set(provider, created);
  return created;
}
export function acquireCircuit(provider: string, configured = true): CircuitSnapshot {
  return configured
    ? providerCircuit(provider).acquire()
    : Object.freeze({ state: 'disabled', failures: 0, consecutiveFailures: 0 });
}
export function circuitSucceeded(provider: string): CircuitSnapshot {
  return providerCircuit(provider).success();
}
export function circuitFailed(provider: string, error?: unknown): CircuitSnapshot {
  return providerCircuit(provider).failure(error);
}
export function snapshotCircuit(provider: string, configured = true): CircuitSnapshot {
  return configured
    ? providerCircuit(provider).snapshot()
    : Object.freeze({ state: 'disabled', failures: 0, consecutiveFailures: 0 });
}
export function resetCircuit(provider: string): CircuitSnapshot {
  circuits.delete(provider);
  return providerCircuit(provider).snapshot();
}
export function resetCircuitsForTests(): void {
  circuits.clear();
}
