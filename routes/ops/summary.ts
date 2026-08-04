import { requireOpsAccess } from '../../server/auth/supabase.js';
import { json, withFunction } from '../../server/http/function.js';
import { buildOpsSummary } from '../../server/ops/summary.js';

export default withFunction('ops.summary', ['GET'], async (request, requestId) => {
  await requireOpsAccess(request);
  return json(await buildOpsSummary(requestId), {}, requestId);
});
