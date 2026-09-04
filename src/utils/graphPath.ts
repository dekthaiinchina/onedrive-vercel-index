import { posix as pathPosix } from 'path'

import siteConfig from '../../config/site.config'

export function graphItemRelativePath(item: { name?: string; parentReference?: { path?: string } }): string | null {
  if (!item.name || !item.parentReference?.path) return null

  const marker = 'root:'
  const markerIndex = item.parentReference.path.toLowerCase().indexOf(marker)
  if (markerIndex < 0) return null

  const driveParent = pathPosix.resolve('/', item.parentReference.path.slice(markerIndex + marker.length))
  const basePath = pathPosix.resolve('/', siteConfig.baseDirectory)
  const parentLower = driveParent.toLowerCase()
  const baseLower = basePath.toLowerCase()
  if (basePath !== '/' && parentLower !== baseLower && !parentLower.startsWith(`${baseLower}/`)) return null

  const relativeParent = driveParent.slice(basePath.length) || '/'
  return pathPosix.join('/', relativeParent, item.name)
}
