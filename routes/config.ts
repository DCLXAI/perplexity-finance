import { capabilities } from '../server/capabilities.js';
import { loadConfig } from '../server/config.js';
import { json, withFunction } from '../server/http/function.js';
import type { PublicRuntimeConfig } from '../src/shared/api.js';

export default withFunction('config', ['GET'], async (_request, requestId) => {
  const config = loadConfig();
  const response: PublicRuntimeConfig = Object.freeze({
    requestId,
    generatedAt: new Date().toISOString(),
    version: config.version,
    releaseChannel: config.releaseChannel,
    deploymentStage: config.deploymentStage,
    ...(config.gitSha ? { gitSha: config.gitSha } : {}),
    capabilities: capabilities(),
    ...(config.vapidPublicKey ? { vapidPublicKey: config.vapidPublicKey } : {}),
    pollIntervalMs: config.pollIntervalMs,
    providerMode: config.marketProviderMode,
  });
  return json(response, {
    headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
  }, requestId);
});
