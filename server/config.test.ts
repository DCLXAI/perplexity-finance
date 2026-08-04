import { afterEach, describe, expect, it } from 'vitest';
import { configDiagnostics, loadConfig, resetConfigForTests } from './config.js';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  resetConfigForTests();
});

describe('runtime configuration boundaries', () => {
  it('never reuses the metrics secret as the operations secret', () => {
    delete process.env.OPS_SECRET;
    process.env.METRICS_SECRET = 'metrics-only-secret';
    resetConfigForTests();

    const config = loadConfig();
    expect(config.metricsSecret).toBe('metrics-only-secret');
    expect(config.opsSecret).toBeUndefined();
  });

  it('warns when machine credentials are reused across trust boundaries', () => {
    process.env.CRON_SECRET = 'shared-machine-secret';
    process.env.METRICS_SECRET = 'shared-machine-secret';
    process.env.OPS_SECRET = 'shared-machine-secret';
    resetConfigForTests();

    const diagnostics = configDiagnostics();
    expect(diagnostics.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('CRON_SECRET와 METRICS_SECRET'),
      expect.stringContaining('CRON_SECRET와 OPS_SECRET'),
      expect.stringContaining('METRICS_SECRET와 OPS_SECRET'),
    ]));
  });
});
