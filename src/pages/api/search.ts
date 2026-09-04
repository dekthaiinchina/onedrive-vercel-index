import axios from 'axios'
import type { NextApiRequest, NextApiResponse } from 'next'

import { checkAuthRoute, encodePath, getAccessToken } from '.'
import apiConfig from '../../../config/api.config'
import siteConfig from '../../../config/site.config'
import { graphItemRelativePath } from '../../utils/graphPath'
import { getClientAddress } from '../../utils/clientAddress'
import { consumeSearchRequest } from '../../utils/odAuthTokenStore'

const maxSearchQueryLength = 256
const metadataConcurrency = 8

async function mapWithConcurrency<T, U>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<U>,
): Promise<U[]> {
  const results = new Array<U>(items.length)
  let nextIndex = 0

  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++
      results[index] = await mapper(items[index])
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return results
}

/**
 * Sanitize the search query
 *
 * @param query User search query, which may contain special characters
 * @returns Sanitised query string, which:
 * - encodes the '<' and '>' characters,
 * - replaces '?' and '/' characters with ' ',
 * - replaces ''' with ''''
 * Reference: https://stackoverflow.com/questions/41491222/single-quote-escaping-in-microsoft-graph.
 */
function sanitiseQuery(query: string): string {
  const sanitisedQuery = query
    .replace(/'/g, "''")
    .replace(/</g, ' &lt; ')
    .replace(/>/g, ' &gt; ')
    .replace(/\?/g, ' ')
    .replace(/\//g, ' ')
  return encodeURIComponent(sanitisedQuery)
}

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

  // Query parameter from request
  const { q: searchQuery = '' } = req.query

  // Set edge function caching for faster load times, check docs:
  // https://vercel.com/docs/concepts/functions/edge-caching
  res.setHeader('Cache-Control', 'private, no-store')

  if (typeof searchQuery === 'string') {
    const query = searchQuery.trim()
    if (!query || query.length > maxSearchQueryLength) {
      res.status(400).json({ error: `Search query must contain between 1 and ${maxSearchQueryLength} characters.` })
      return
    }

    try {
      if (!(await consumeSearchRequest(getClientAddress(req)))) {
        res.setHeader('Retry-After', '60')
        res.status(429).json({ error: 'Too many search requests. Try again later.' })
        return
      }
    } catch {
      res.status(503).json({ error: 'Search rate limiting is unavailable.' })
      return
    }

    // Construct Microsoft Graph Search API URL, and perform search only under the base directory
    const searchRootPath = encodePath('/')
    const encodedPath = searchRootPath === '' ? searchRootPath : searchRootPath + ':'

    const searchApi = `${apiConfig.driveApi}/root${encodedPath}/search(q='${sanitiseQuery(query)}')`

    try {
      const { data } = await axios.get(searchApi, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          select: 'id,name,file,folder,parentReference',
          $top: siteConfig.maxItems,
        },
      })

      const searchItems: any[] = Array.isArray(data?.value)
        ? data.value.slice(0, Math.min(siteConfig.maxItems, 100))
        : []
      const items = await mapWithConcurrency(searchItems, metadataConcurrency, async item => {
        if (item.parentReference?.path) return item
        const { data: details } = await axios.get(`${apiConfig.driveApi}/items/${encodeURIComponent(item.id)}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { select: 'id,name,file,folder,parentReference' },
        })
        return { ...item, ...details }
      })

      const visible: unknown[] = []
      for (const item of items) {
        if (item.name.toLowerCase() === '.password') continue
        const relativePath = graphItemRelativePath(item)
        if (!relativePath) continue
        const auth = await checkAuthRoute(relativePath, req)
        if (auth.code === 200) visible.push(item)
      }
      res.status(200).json(visible)
    } catch (error: any) {
      res.status(error?.response?.status ?? 500).json({ error: error?.response?.data ?? 'Internal server error.' })
    }
  } else {
    res.status(400).json({ error: 'Search query invalid.' })
  }
  return
}
