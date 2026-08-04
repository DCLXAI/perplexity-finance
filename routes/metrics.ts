import { json, requireMetricsSecret, withFunction } from '../server/http/function.js';
import { metrics } from '../server/observability/metrics.js';

export default withFunction('metrics', ['GET'], async (request, requestId) => {
  requireMetricsSecret(request);
  return json(metrics.snapshot(), {}, requestId);
});
