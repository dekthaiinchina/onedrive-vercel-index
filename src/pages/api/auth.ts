import { createHash, timingSafeEqual } from 'crypto'
import { posix as pathPosix } from 'path'

import axios from 'axios'
import type { NextApiRequest, NextApiResponse } from 'next'

import apiConfig from '../../../config/api.config'
import siteConfig from '../../../config/site.config'
import {
  createProtectedSession,
  consumeProtectedAuthAttempt,
  protectedSessionCookieName,
  revokeProtectedSession,
  validateProtectedSession,
} from '../../utils/odAuthTokenStore'
import { getClientAddress } from '../../utils/clientAddress'
import { matchProtectedRoute } from '../../utils/protectedRouteHandler'
import { encodePath, getAccessToken, getAuthTokenPath } from '.'

function passwordMatches(actual: string, expected: string): boolean {
  const actualHash = createHash('sha256').update(actual.trim()).digest()
  const expectedHash = createHash('sha256').update(expected.trim()).digest()
  return timingSafeEqual(actualHash, expectedHash)
}

function cookie(name: string, value: string, maxAge: number): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${secure}`
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')

  if (req.method === 'GET') {
    const routes = (siteConfig.protectedRoutes as unknown[]).filter(
      (route): route is string => typeof route === 'string' && route.length > 0,
    )
    const states = await Promise.all(
      routes.map(route => validateProtectedSession(route, req.cookies[protectedSessionCookieName(route)])),
    )
    res.status(200).json({ authenticated: states.some(Boolean) })
    return
  }

  if (req.method === 'DELETE') {
    const routes = (siteConfig.protectedRoutes as unknown[]).filter(
      (route): route is string => typeof route === 'string' && route.length > 0,
    )
    try {
      await Promise.all(
        routes.map(route => revokeProtectedSession(route, req.cookies[protectedSessionCookieName(route)])),
      )
    } catch {
      res.status(503).json({ error: 'Could not revoke protected sessions.' })
      return
    }
    const expired = routes.map(route => cookie(protectedSessionCookieName(route), '', 0))
    res.setHeader('Set-Cookie', expired)
    res.status(204).end()
    return
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, DELETE')
    res.status(405).json({ error: 'Method not allowed.' })
    return
  }

  const { path, password } = req.body ?? {}
  if (typeof path !== 'string' || typeof password !== 'string' || password.length > 1024) {
    res.status(400).json({ error: 'Invalid request body.' })
    return
  }

  const cleanPath = pathPosix.resolve('/', pathPosix.normalize(path))
  const route = matchProtectedRoute(cleanPath)
  const passwordPath = getAuthTokenPath(cleanPath)
  if (!route || !passwordPath) {
    res.status(400).json({ error: 'The requested path is not protected.' })
    return
  }

  try {
    const clientAddress = getClientAddress(req)
    if (!(await consumeProtectedAuthAttempt(`${clientAddress}:${route}`))) {
      res.status(429).json({ error: 'Too many authentication attempts. Try again later.' })
      return
    }

    const accessToken = await getAccessToken()
    if (!accessToken) {
      res.status(403).json({ error: 'No access token.' })
      return
    }

    const { data: item } = await axios.get(`${apiConfig.driveApi}/root${encodePath(passwordPath)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { select: 'id,size,@microsoft.graph.downloadUrl' },
    })
    if (!item['@microsoft.graph.downloadUrl'] || Number(item.size) > 4096) {
      res.status(400).json({ error: 'The password file is invalid.' })
      return
    }

    const { data: expectedPassword } = await axios.get(item['@microsoft.graph.downloadUrl'], {
      responseType: 'text',
      maxContentLength: 4096,
    })
    if (!passwordMatches(password, String(expectedPassword))) {
      res.status(401).json({ error: 'Incorrect password.' })
      return
    }

    const session = await createProtectedSession(route)
    res.setHeader('Set-Cookie', cookie(protectedSessionCookieName(route), session.token, session.maxAge))
    res.status(200).json({ ok: true })
  } catch (error: any) {
    const status = error?.response?.status === 404 ? 404 : 500
    res.status(status).json({ error: status === 404 ? 'Password file not found.' : 'Authentication failed.' })
  }
}
