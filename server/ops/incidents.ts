import { logger } from '../observability/logger.js';
import type { DataQualityIncident, IncidentKind, IncidentSeverity, ProviderName } from '../../src/shared/api.js';

const incidents: DataQualityIncident[] = [];
const MAX_INCIDENTS = 200;
type IncidentDetails = Readonly<Record<string, string | number | boolean | null>>;

export function recordIncident(input: {
  kind: IncidentKind;
  severity: IncidentSeverity;
  symbol?: string;
  providers?: readonly ProviderName[];
  message: string;
  details?: IncidentDetails;
}): DataQualityIncident {
  const incident: DataQualityIncident = Object.freeze({
    id: globalThis.crypto.randomUUID(),
    kind: input.kind,
    severity: input.severity,
    ...(input.symbol ? { symbol: input.symbol } : {}),
    providers: Object.freeze([...(input.providers ?? [])]),
    message: input.message,
    details: Object.freeze({ ...(input.details ?? {}) }),
    createdAt: new Date().toISOString(),
  });
  incidents.unshift(incident);
  if (incidents.length > MAX_INCIDENTS) incidents.length = MAX_INCIDENTS;
  const log = input.severity === 'critical' ? logger.error : input.severity === 'warning' ? logger.warn : logger.info;
  log('data_quality.incident', incident);
  return incident;
}
export function recentIncidents(limit = 50): readonly DataQualityIncident[] {
  return Object.freeze(incidents.slice(0, Math.max(0, Math.min(limit, MAX_INCIDENTS))));
}
export function clearIncidentsForTests(): void {
  incidents.length = 0;
}
