import axios from 'axios'
import type { NextApiRequest, NextApiResponse } from 'next'

import { checkAuthRoute, getAccessToken } from '.'
import apiConfig from '../../../config/api.config'
import { graphItemRelativePath } from '../../utils/graphPath'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    res.status(405).json({ error: 'Method not allowed.' })
    return
  }

  // Get access token from storage
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

  // Get item details (specifically, its path) by its unique ID in OneDrive
  const { id = '' } = req.query

  // Set edge function caching for faster load times, check docs:
  // https://vercel.com/docs/concepts/functions/edge-caching
  res.setHeader('Cache-Control', 'private, no-store')

  if (typeof id === 'string' && id.length > 0 && id.length <= 512) {
    const itemApi = `${apiConfig.driveApi}/items/${encodeURIComponent(id)}`

    try {
      const { data } = await axios.get(itemApi, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          select: 'id,name,parentReference',
        },
      })
      const relativePath = graphItemRelativePath(data)
      if (!relativePath || data.name.toLowerCase() === '.password') {
        res.status(404).json({ error: 'Item not found.' })
        return
      }
      const auth = await checkAuthRoute(relativePath, req)
      if (auth.code !== 200) {
        res.status(auth.code).json({ error: auth.message })
        return
      }
      res.status(200).json(data)
    } catch (error: any) {
      res.status(error?.response?.status ?? 500).json({ error: error?.response?.data ?? 'Internal server error.' })
    }
  } else {
    res.status(400).json({ error: 'Invalid driveItem ID.' })
  }
  return
}
