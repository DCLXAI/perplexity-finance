import { json, withFunction } from '../server/http/function.js';
import { buildReadinessWithPersistence } from '../server/ops/summary.js';

export default withFunction('ready', ['GET'], async (_request, requestId) => {
  const readiness = await buildReadinessWithPersistence(requestId);
  return json(readiness, { status: readiness.ready ? 200 : 503 }, requestId);
});
