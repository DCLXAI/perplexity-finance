import { loadConfig } from './config.js';
import type { PublicRuntimeConfig } from '../src/shared/api.js';

export function capabilities(): PublicRuntimeConfig['capabilities'] {
  const config = loadConfig();
  const cloud = Boolean(config.supabaseUrl && config.supabaseAnonKey && config.supabaseServiceRoleKey);
  return Object.freeze({
    alpaca: Boolean(config.alpacaKeyId && config.alpacaSecretKey),
    secondaryEquity: Boolean(config.finnhubApiKey),
    secondaryCrypto: config.coinbaseEnabled,
    cloudAccount: cloud,
    durableAlerts: cloud && Boolean(config.cronSecret),
    emailDelivery: cloud && Boolean(config.resendApiKey && config.alertEmailFrom),
    pushDelivery: cloud && Boolean(config.vapidPublicKey && config.vapidPrivateKey),
    aiTools: Boolean(config.openAiApiKey && config.openAiModel),
    distributedCache: Boolean(config.upstashUrl && config.upstashToken),
    persistentMarketLedger: cloud,
    opsControlPlane: cloud || Boolean(config.opsSecret),
    releaseGates: true,
    portfolioLedger: cloud,
    portfolioRisk: true,
    researchWorkspace: cloud,
  });
}
