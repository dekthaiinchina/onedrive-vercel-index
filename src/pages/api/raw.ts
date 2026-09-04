import { posix as pathPosix } from 'path'

import type { NextApiRequest, NextApiResponse } from 'next'
import axios from 'axios'
import Cors from 'cors'

import { driveApi, cacheControlHeader } from '../../../config/api.config'
import { encodePath, getAccessToken, checkAuthRoute, isHiddenPath } from '.'
import { matchProtectedRoute } from '../../utils/protectedRouteHandler'

const activeContentTypes = new Set([
  'application/javascript',
  'application/xhtml+xml',
  'application/xml',
  'image/svg+xml',
  'text/html',
  'text/javascript',
  'text/xml',
])

function isActiveContentType(contentType: unknown): boolean {
  if (typeof contentType !== 'string') return false
  const mediaType = contentType.split(';', 1)[0].trim().toLowerCase()
  return activeContentTypes.has(mediaType) || mediaType.endsWith('+xml') || mediaType.includes('javascript')
}

function safeAttachmentName(path: string): string {
  return `UTF-8''${encodeURIComponent(pathPosix.basename(path) || 'download')}`
}

// CORS middleware for raw links: https://nextjs.org/docs/api-routes/api-middlewares
export function runCorsMiddleware(req: NextApiRequest, res: NextApiResponse) {
  const cors = Cors({ methods: ['GET', 'HEAD'] })
  return new Promise((resolve, reject) => {
    cors(req, res, result => {
      if (result instanceof Error) {
        return reject(result)
      }

      return resolve(result)
    })
  })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    res.status(405).json({ error: 'Method not allowed.' })
    return
  }

  let accessToken = ''
  try {
    accessToken = await getAccessToken()
  } catch {
    res.status(500).json({ error: 'Token storage is unavailable.' })
    return
  }
  if (!accessToken) {
    res.status(403).json({ error: 'No access token.' })
    return
  }

  const { path = '/', proxy = 'false' } = req.query

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
  const cleanPath = pathPosix.resolve('/', pathPosix.normalize(path))
  if (isHiddenPath(cleanPath)) {
    res.status(404).json({ error: 'Item not found.' })
    return
  }
  const protectedPath = Boolean(matchProtectedRoute(cleanPath))
  res.setHeader('Cache-Control', protectedPath ? 'private, no-store' : 'no-cache')

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

  await runCorsMiddleware(req, res)
  try {
    // Handle response from OneDrive API
    const requestUrl = `${driveApi}/root${encodePath(cleanPath)}`
    const { data } = await axios.get(requestUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        // OneDrive international version fails when only selecting the downloadUrl (what a stupid bug)
        select: 'id,size,@microsoft.graph.downloadUrl',
      },
    })

    if ('@microsoft.graph.downloadUrl' in data) {
      // Only proxy raw file content response for files up to 4MB
      if (proxy === 'true' && 'size' in data && data['size'] < 4194304) {
        const { headers, data: stream } = await axios.get(data['@microsoft.graph.downloadUrl'] as string, {
          responseType: 'stream',
        })
        const contentType = headers['content-type']
        const contentLength = headers['content-length']
        const contentDisposition = headers['content-disposition']
        if (!contentType || isActiveContentType(contentType)) {
          // Never render executable OneDrive content under the application's origin.
          res.setHeader('Content-Type', 'application/octet-stream')
          res.setHeader('Content-Disposition', `attachment; filename*=${safeAttachmentName(cleanPath)}`)
        } else {
          if (contentType) res.setHeader('Content-Type', String(contentType))
          if (contentDisposition) res.setHeader('Content-Disposition', String(contentDisposition))
        }
        if (contentLength) res.setHeader('Content-Length', String(contentLength))
        res.setHeader('Cache-Control', protectedPath ? 'private, no-store' : cacheControlHeader)
        stream.pipe(res)
      } else {
        res.redirect(data['@microsoft.graph.downloadUrl'])
      }
    } else {
      res.status(404).json({ error: 'No download url found.' })
    }
    return
  } catch (error: any) {
    res.status(error?.response?.status ?? 500).json({ error: error?.response?.data ?? 'Internal server error.' })
    return
  }
}
