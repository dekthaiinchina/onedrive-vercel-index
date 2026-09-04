import { posix as pathPosix } from 'path'

import type { NextApiRequest, NextApiResponse } from 'next'
import axios from 'axios'

import apiConfig from '../../../config/api.config'
import siteConfig from '../../../config/site.config'
import { getAuthPersonInfo, getServerClientSecret, requestTokenWithAuthCode } from '../../utils/oAuthServer'
import { matchProtectedRoute } from '../../utils/protectedRouteHandler'
import {
  getOdAuthTokens,
  protectedSessionCookieName,
  storeOdAuthTokens,
  validateProtectedSession,
} from '../../utils/odAuthTokenStore'
import { runCorsMiddleware } from './raw'

const basePath = pathPosix.resolve('/', siteConfig.baseDirectory)
const clientSecret = getServerClientSecret()
let refreshPromise: Promise<string> | undefined

/**
 * Encode the path of the file relative to the base directory
 *
 * @param path Relative path of the file to the base directory
 * @returns Absolute path of the file inside OneDrive
 */
export function encodePath(path: string): string {
  let encodedPath = pathPosix.join(basePath, path)
  if (encodedPath === '/' || encodedPath === '') {
    return ''
  }
  encodedPath = encodedPath.replace(/\/$/, '')
  return `:${encodeURIComponent(encodedPath)}`
}

/**
 * Fetch the access token from Redis storage and check if the token requires a renew
 *
 * @returns Access token for OneDrive API
 */
export async function getAccessToken(): Promise<string> {
  const { accessToken, refreshToken } = await getOdAuthTokens()

  // Return in storage access token if it is still valid
  if (typeof accessToken === 'string') {
    console.log('Fetch access token from storage.')
    return accessToken
  }

  // Return empty string if no refresh token is stored, which requires the application to be re-authenticated
  if (typeof refreshToken !== 'string') {
    console.log('No refresh token, return empty access token.')
    return ''
  }

  if (!clientSecret) return ''

  // Coalesce refreshes within one server instance. Redis TTL includes a safety
  // margin, so most requests will not race at the provider's expiry boundary.
  refreshPromise ??= (async () => {
    const body = new URLSearchParams({
      client_id: apiConfig.clientId,
      redirect_uri: apiConfig.redirectUri,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    })
    const { data } = await axios.post(apiConfig.authApi, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })

    if (!data?.access_token || !Number.isFinite(Number(data?.expires_in))) return ''
    await storeOdAuthTokens({
      accessToken: data.access_token,
      accessTokenExpiry: Number(data.expires_in),
      refreshToken: data.refresh_token || refreshToken,
    })
    return data.access_token as string
  })().finally(() => {
    refreshPromise = undefined
  })

  return refreshPromise
}

/**
 * Match protected routes in site config to get path to required auth token
 * @param path Path cleaned in advance
 * @returns Path to required auth token. If not required, return empty string.
 */
export function getAuthTokenPath(path: string) {
  const route = matchProtectedRoute(path)
  return route ? `${route.replace(/\/$/, '')}/.password` : ''
}

export function isHiddenPath(path: string): boolean {
  return pathPosix.basename(path).toLowerCase() === '.password'
}

/** Validate the short-lived, server-side session for a protected route. */
export async function checkAuthRoute(
  cleanPath: string,
  req: NextApiRequest,
): Promise<{ code: 200 | 401 | 404 | 500; message: string }> {
  const route = matchProtectedRoute(cleanPath)
  if (!route) {
    return { code: 200, message: '' }
  }

  try {
    const cookieName = protectedSessionCookieName(route)
    const cookie = req.cookies[cookieName]
    if (!(await validateProtectedSession(route, cookie))) {
      return { code: 401, message: 'Password required.' }
    }
  } catch {
    return { code: 500, message: 'Internal server error.' }
  }

  return { code: 200, message: 'Authenticated.' }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    const { authCode } = req.body ?? {}
    if (typeof authCode !== 'string' || authCode.length < 1 || authCode.length > 4096) {
      res.status(400).json({ error: 'Invalid authorisation code.' })
      return
    }

    if (!siteConfig.userPrincipalName) {
      res.status(500).json({ error: 'userPrincipalName is not configured.' })
      return
    }

    try {
      const { accessToken, refreshToken, expiresIn } = await requestTokenWithAuthCode(authCode)
      const { data } = await getAuthPersonInfo(accessToken)
      const expectedOwnerId = process.env.OWNER_USER_ID
      const ownerMatches = expectedOwnerId
        ? data?.id === expectedOwnerId
        : data?.userPrincipalName?.toLowerCase() === siteConfig.userPrincipalName.toLowerCase()
      if (!ownerMatches) {
        res.status(403).json({ error: 'The authenticated Microsoft account is not the configured site owner.' })
        return
      }
      await storeOdAuthTokens({ accessToken, accessTokenExpiry: expiresIn, refreshToken })
      res.status(200).json({ ok: true })
    } catch (error: any) {
      res.status(error?.response?.status === 400 ? 400 : 500).json({ error: 'OAuth initialisation failed.' })
    }
    return
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD, POST')
    res.status(405).json({ error: 'Method not allowed.' })
    return
  }

  // If method is GET, then the API is a normal request to the OneDrive API for files or folders
  const { path = '/', raw = false, next = '', sort = '' } = req.query

  // Set edge function caching for faster load times, check docs:
  // https://vercel.com/docs/concepts/functions/edge-caching
  // Sometimes the path parameter is defaulted to '[...path]' which we need to handle
  if (path === '[...path]') {
    res.status(400).json({ error: 'No path specified.' })
    return
  }
  // If the path is not a valid path, return 400
  if (typeof path !== 'string') {
    res.status(400).json({ error: 'Path query invalid.' })
    return
  }
  // Besides normalizing and making absolute, trailing slashes are trimmed
  const cleanPath = pathPosix.resolve('/', pathPosix.normalize(path)).replace(/\/$/, '')
  if (isHiddenPath(cleanPath)) {
    res.status(404).json({ error: 'Item not found.' })
    return
  }
  const protectedPath = Boolean(matchProtectedRoute(cleanPath))
  res.setHeader('Cache-Control', protectedPath ? 'private, no-store' : apiConfig.cacheControlHeader)

  // Validate sort param
  if (typeof sort !== 'string') {
    res.status(400).json({ error: 'Sort query invalid.' })
    return
  }

  let accessToken = ''
  try {
    accessToken = await getAccessToken()
  } catch {
    res.status(500).json({ error: 'Token storage is unavailable.' })
    return
  }

  // Return error 403 if access_token is empty
  if (!accessToken) {
    res.status(403).json({ error: 'No access token.' })
    return
  }

  // Handle protected routes authentication
  const { code, message } = await checkAuthRoute(cleanPath, req)
  // Status code other than 200 means user has not authenticated yet
  if (code !== 200) {
    res.status(code).json({ error: message })
    return
  }
  // If message is empty, then the path is not protected.
  // Conversely, protected routes are not allowed to serve from cache.
  if (message !== '') {
    res.setHeader('Cache-Control', 'private, no-store')
  }

  const requestPath = encodePath(cleanPath)
  // Handle response from OneDrive API
  const requestUrl = `${apiConfig.driveApi}/root${requestPath}`
  // Whether path is root, which requires some special treatment
  const isRoot = requestPath === ''

  // Go for file raw download link, add CORS headers, and redirect to @microsoft.graph.downloadUrl
  // (kept here for backwards compatibility, and cache headers will be reverted to no-cache)
  if (raw === 'true') {
    await runCorsMiddleware(req, res)
    res.setHeader('Cache-Control', protectedPath ? 'private, no-store' : 'no-cache')

    const { data } = await axios.get(requestUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        // OneDrive international version fails when only selecting the downloadUrl (what a stupid bug)
        select: 'id,@microsoft.graph.downloadUrl',
      },
    })

    if ('@microsoft.graph.downloadUrl' in data) {
      res.redirect(data['@microsoft.graph.downloadUrl'])
    } else {
      res.status(404).json({ error: 'No download url found.' })
    }
    return
  }

  // Querying current path identity (file or folder) and follow up query childrens in folder
  try {
    const { data: identityData } = await axios.get(requestUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        select: 'name,size,id,lastModifiedDateTime,folder,file,video,image',
      },
    })

    if ('folder' in identityData) {
      const { data: folderData } = await axios.get(`${requestUrl}${isRoot ? '' : ':'}/children`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          ...{
            select: 'name,size,id,lastModifiedDateTime,folder,file,video,image',
            $top: siteConfig.maxItems,
          },
          ...(next ? { $skipToken: next } : {}),
          ...(sort ? { $orderby: sort } : {}),
        },
      })

      // Extract next page token from full @odata.nextLink
      folderData.value = folderData.value.filter(item => item.name.toLowerCase() !== '.password')
      const nextPage = folderData['@odata.nextLink']
        ? new URL(folderData['@odata.nextLink']).searchParams.get('$skiptoken')
        : null

      // Return paging token if specified
      if (nextPage) {
        res.status(200).json({ folder: folderData, next: nextPage })
      } else {
        res.status(200).json({ folder: folderData })
      }
      return
    }
    res.status(200).json({ file: identityData })
    return
  } catch (error: any) {
    res.status(error?.response?.status ?? 500).json({ error: error?.response?.data ?? 'Internal server error.' })
    return
  }
}
