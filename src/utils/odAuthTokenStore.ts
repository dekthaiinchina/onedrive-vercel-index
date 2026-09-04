import Redis from 'ioredis'
import { createHash, randomBytes } from 'crypto'
import siteConfig from '../../config/site.config'

// Persistent key-value store is provided by Redis, hosted on Upstash
// https://vercel.com/integrations/upstash
let kv: Redis | undefined

function getKv(): Redis {
  if (!process.env.REDIS_URL) {
    throw new Error('REDIS_URL is not configured.')
  }
  if (typeof siteConfig.kvPrefix !== 'string' || !siteConfig.kvPrefix.trim()) {
    throw new Error('KV_PREFIX is not configured and no deployment-specific namespace is available.')
  }
  kv ??= new Redis(process.env.REDIS_URL)
  return kv
}

export async function getOdAuthTokens(): Promise<{ accessToken: unknown; refreshToken: unknown }> {
  const accessToken = await getKv().get(`${siteConfig.kvPrefix}access_token`)
  const refreshToken = await getKv().get(`${siteConfig.kvPrefix}refresh_token`)

  return {
    accessToken,
    refreshToken,
  }
}

export async function storeOdAuthTokens({
  accessToken,
  accessTokenExpiry,
  refreshToken,
}: {
  accessToken: string
  accessTokenExpiry: number
  refreshToken: string
}): Promise<void> {
  if (!Number.isInteger(accessTokenExpiry) || accessTokenExpiry <= 0) {
    throw new Error('Invalid access token expiry.')
  }

  // Renew slightly before Microsoft expires the token.
  const ttl = Math.max(1, accessTokenExpiry - 60)
  await getKv().set(`${siteConfig.kvPrefix}access_token`, accessToken, 'EX', ttl)
  await getKv().set(`${siteConfig.kvPrefix}refresh_token`, refreshToken)
}

const protectedSessionTtl = 12 * 60 * 60

function sessionKey(route: string, token: string): string {
  const routeHash = createHash('sha256').update(route).digest('hex')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  return `${siteConfig.kvPrefix}protected_session:${routeHash}:${tokenHash}`
}

export function protectedSessionCookieName(route: string): string {
  return `odps_${createHash('sha256').update(route).digest('hex').slice(0, 16)}`
}

export async function createProtectedSession(route: string): Promise<{ token: string; maxAge: number }> {
  const token = randomBytes(32).toString('base64url')
  await getKv().set(sessionKey(route, token), '1', 'EX', protectedSessionTtl)
  return { token, maxAge: protectedSessionTtl }
}

export async function validateProtectedSession(route: string, token: string | undefined): Promise<boolean> {
  if (!token) return false
  return (await getKv().get(sessionKey(route, token))) === '1'
}

export async function revokeProtectedSession(route: string, token: string | undefined): Promise<void> {
  if (!token) return
  await getKv().del(sessionKey(route, token))
}

async function consumeRateLimit(
  scope: string,
  identifier: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const hash = createHash('sha256').update(identifier).digest('hex')
  const key = `${siteConfig.kvPrefix}${scope}:${hash}`
  const count = await getKv().eval(
    "local count = redis.call('INCR', KEYS[1]); if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; return count",
    1,
    key,
    windowSeconds,
  )
  return Number(count) <= limit
}

export function consumeProtectedAuthAttempt(identifier: string): Promise<boolean> {
  return consumeRateLimit('protected_auth_attempt', identifier, 10, 10 * 60)
}

export function consumeSearchRequest(identifier: string): Promise<boolean> {
  return consumeRateLimit('search_request', identifier, 30, 60)
}
