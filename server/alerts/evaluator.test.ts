import { describe, expect, it } from 'vitest';
import { didCross } from './evaluator.js';

describe('durable alert evaluator', () => {
  it('fires only on a directional crossing', () => {
    expect(didCross('above', 99, 100, 100)).toBe(true);
    expect(didCross('above', 100, 101, 100)).toBe(false);
    expect(didCross('below', 101, 100, 100)).toBe(true);
    expect(didCross('below', 100, 99, 100)).toBe(false);
  });
});
