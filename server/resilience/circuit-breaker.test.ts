import { describe, expect, it } from 'vitest';
import { CircuitBreaker, CircuitOpenError } from './circuit-breaker.js';

describe('provider circuit breaker', () => {
  it('opens after the threshold and admits only one half-open probe', async () => {
    const circuit = new CircuitBreaker('test-provider', 2, 100);
    expect(circuit.failure(new Error('one'), 1_000).state).toBe('closed');
    expect(circuit.failure(new Error('two'), 1_001).state).toBe('open');
    expect(circuit.acquire(1_050).state).toBe('open');
    expect(circuit.acquire(1_102).state).toBe('half-open');
    expect(circuit.acquire(1_102).state).toBe('open');
    expect(circuit.success().state).toBe('closed');

    const opened = new CircuitBreaker('execute-provider', 1, 1_000);
    await expect(opened.execute(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    await expect(opened.execute(async () => 'never')).rejects.toBeInstanceOf(CircuitOpenError);
  });
});
