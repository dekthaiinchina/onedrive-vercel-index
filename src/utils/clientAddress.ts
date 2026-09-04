import type { NextApiRequest } from 'next'

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  const header = Array.isArray(value) ? value[0] : value
  return header?.split(',')[0]?.trim() || undefined
}

/**
 * Return an address suitable for abuse controls without trusting arbitrary
 * forwarding headers on self-hosted deployments.
 */
export function getClientAddress(req: NextApiRequest): string {
  const trustedForwardedFor =
    process.env.VERCEL === '1'
      ? (firstHeaderValue(req.headers['x-vercel-forwarded-for']) ?? firstHeaderValue(req.headers['x-forwarded-for']))
      : process.env.TRUST_PROXY === 'true'
        ? firstHeaderValue(req.headers['x-forwarded-for'])
        : undefined

  return (trustedForwardedFor ?? req.socket.remoteAddress ?? 'unknown').slice(0, 128)
}
