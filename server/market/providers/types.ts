import type { ProviderName, RemoteQuotePatch } from '../../../src/shared/api.js';

export interface QuoteProvider {
  readonly name: ProviderName;
  readonly label: string;
  readonly configured: boolean;
  supports(symbol: string): boolean;
  fetchQuotes(symbols: readonly string[]): Promise<readonly RemoteQuotePatch[]>;
}
