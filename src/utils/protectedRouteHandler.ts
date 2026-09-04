import siteConfig from '../../config/site.config'

function decodePath(path: string): string {
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

export function normaliseProtectedPath(path: string): string {
  const normalised = `/${decodePath(path)}`.replace(/\/+/g, '/').replace(/\/$/, '')
  return (normalised || '/').toLowerCase()
}

/** Return the most-specific configured protected route that contains path. */
export function matchProtectedRoute(path: string): string {
  const normalisedPath = normaliseProtectedPath(path)

  return (
    (siteConfig.protectedRoutes as unknown[])
      .filter((route): route is string => typeof route === 'string' && route.length > 0)
      .map(route => ({ configured: route, normalised: normaliseProtectedPath(route) }))
      .filter(({ normalised }) => normalisedPath === normalised || normalisedPath.startsWith(`${normalised}/`))
      .sort((a, b) => b.normalised.length - a.normalised.length)[0]?.configured ?? ''
  )
}
