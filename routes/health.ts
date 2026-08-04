import { capabilities } from '../server/capabilities.js';
import { configDiagnostics, loadConfig } from '../server/config.js';
import { json, withFunction } from '../server/http/function.js';
import { resolveMarketProviderStatuses } from '../server/ops/summary.js';
import type { HealthResponse, ProviderStatus } from '../src/shared/api.js';

function staticStatus(
  provider: ProviderStatus['provider'],
  configured: boolean,
  message: string,
): ProviderStatus {
  return Object.freeze({
    provider,
    configured,
    status: configured ? 'degraded' : 'disabled',
    mode: configured ? 'snapshot' : 'fallback',
    message: configured ? `${message} · 이 인스턴스에서 아직 probe하지 않았습니다.` : message,
    checkedAt: new Date().toISOString(),
    circuitState: configured ? 'closed' : 'disabled',
    attempts: 0,
    successRate: 0,
  });
}

export default withFunction('health', ['GET'], async (_request, requestId) => {
  const config = loadConfig();
  const caps = capabilities();
  const diagnostics = configDiagnostics(config);
  const providers = Object.freeze([
    ...await resolveMarketProviderStatuses(),
    staticStatus('supabase', caps.cloudAccount, caps.cloudAccount ? 'Cloud persistence configured' : 'Cloud disabled'),
    staticStatus('openai', caps.aiTools, caps.aiTools ? `Model ${config.openAiModel} configured` : 'AI local fallback'),
    staticStatus('resend', caps.emailDelivery, caps.emailDelivery ? 'Email configured' : 'Email disabled'),
    staticStatus('web-push', caps.pushDelivery, caps.pushDelivery ? 'Push configured' : 'Push disabled'),
    staticStatus('upstash', caps.distributedCache, caps.distributedCache ? 'Distributed cache configured' : 'Process cache'),
  ]);
  const marketConfigured = caps.alpaca || caps.secondaryEquity || caps.secondaryCrypto;
  const marketProviders = providers.filter((provider) => ['alpaca', 'finnhub', 'coinbase'].includes(provider.provider));
  const verifiedMarketSuccess = marketProviders.some((provider) => provider.configured && provider.status === 'up');
  const down = diagnostics.errors.length > 0;
  const degraded = !down && (
    !marketConfigured
    || !verifiedMarketSuccess
    || marketProviders.some((provider) => provider.configured && provider.status === 'down')
  );
  const response: HealthResponse = Object.freeze({
    requestId,
    status: down ? 'down' : degraded ? 'degraded' : 'up',
    version: config.version,
    releaseChannel: config.releaseChannel,
    deploymentStage: config.deploymentStage,
    ...(config.gitSha ? { gitSha: config.gitSha } : {}),
    generatedAt: new Date().toISOString(),
    ...(process.env.VERCEL_REGION ? { region: process.env.VERCEL_REGION } : {}),
    capabilities: caps,
    providers,
    configWarnings: Object.freeze([...diagnostics.errors, ...diagnostics.warnings]),
  });
  return json(response, {}, requestId);
});
