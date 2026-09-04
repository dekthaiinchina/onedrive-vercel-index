import type { OdThumbnail } from '../../types'

import { posix as pathPosix } from 'path'

import axios from 'axios'
import type { NextApiRequest, NextApiResponse } from 'next'

import { checkAuthRoute, encodePath, getAccessToken, isHiddenPath } from '.'
import apiConfig from '../../../config/api.config'
import { matchProtectedRoute } from '../../utils/protectedRouteHandler'

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

  // Get item thumbnails by its path since we will later check if it is protected
  const { path = '', size = 'medium' } = req.query

  // Check whether the size is valid - must be one of 'large', 'medium', or 'small'
  if (size !== 'large' && size !== 'medium' && size !== 'small') {
    res.status(400).json({ error: 'Invalid size' })
    return
  }
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
  res.setHeader('Cache-Control', protectedPath ? 'private, no-store' : apiConfig.cacheControlHeader)

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

  try {
    const { data } = await axios.get(`${requestUrl}${isRoot ? '' : ':'}/thumbnails`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    const thumbnailUrl = data.value && data.value.length > 0 ? (data.value[0] as OdThumbnail)[size].url : null
    if (thumbnailUrl) {
      res.redirect(thumbnailUrl)
    } else {
      res.status(400).json({ error: "The item doesn't have a valid thumbnail." })
    }
  } catch (error: any) {
    res.status(error?.response?.status ?? 500).json({ error: error?.response?.data ?? 'Internal server error.' })
  }
  return
}
