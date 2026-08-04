import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { loadConfig } from '../config.js';
import { ApiError, bearerToken, secureSecretEqual } from '../http/function.js';

let admin: SupabaseClient | null = null;
let verifier: SupabaseClient | null = null;

export function supabaseConfigured(): boolean {
  const config = loadConfig();
  return Boolean(config.supabaseUrl && config.supabaseServiceRoleKey);
}

export function getSupabaseAdmin(): SupabaseClient {
  const config = loadConfig();
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new ApiError(503, 'CLOUD_NOT_CONFIGURED', 'Supabase 서버 연결이 설정되지 않았습니다.');
  }
  admin ??= createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

function getVerifier(): SupabaseClient {
  const config = loadConfig();
  const key = config.supabaseAnonKey ?? config.supabaseServiceRoleKey;
  if (!config.supabaseUrl || !key) {
    throw new ApiError(503, 'AUTH_NOT_CONFIGURED', 'Supabase 인증 검증이 설정되지 않았습니다.');
  }
  verifier ??= createClient(config.supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return verifier;
}

export async function optionalUser(request: Request): Promise<User | null> {
  const token = bearerToken(request);
  if (!token) return null;
  const { data, error } = await getVerifier().auth.getUser(token);
  if (error || !data.user) throw new ApiError(401, 'INVALID_SESSION', '로그인 세션이 유효하지 않습니다.');
  return data.user;
}

export async function requireUser(request: Request): Promise<User> {
  const user = await optionalUser(request);
  if (!user) throw new ApiError(401, 'AUTH_REQUIRED', '로그인이 필요합니다.');
  return user;
}

export function userRoles(user: Pick<User, 'app_metadata'>): readonly string[] {
  const metadata = user.app_metadata ?? {};
  const role = typeof metadata.role === 'string' ? [metadata.role] : [];
  const roles = Array.isArray(metadata.roles)
    ? metadata.roles.filter((value): value is string => typeof value === 'string')
    : [];
  return Object.freeze([...new Set([...role, ...roles].map((value) => value.toLowerCase()))]);
}

export function isOpsUser(user: Pick<User, 'app_metadata'>): boolean {
  const allowed = new Set(loadConfig().opsRoles ?? ['ops', 'admin']);
  return userRoles(user).some((role) => allowed.has(role));
}

export async function requireOpsUser(request: Request): Promise<User> {
  const user = await requireUser(request);
  if (!isOpsUser(user)) throw new ApiError(403, 'OPS_ROLE_REQUIRED', '운영자 권한이 필요합니다.');
  return user;
}

export async function requireOpsAccess(request: Request): Promise<User | null> {
  const config = loadConfig();
  const machineSecret = request.headers.get('x-ops-secret') ?? bearerToken(request);
  if (config.opsSecret && secureSecretEqual(machineSecret ?? undefined, config.opsSecret)) return null;
  return requireOpsUser(request);
}

export function resetSupabaseClientsForTests(): void {
  admin = null;
  verifier = null;
}
