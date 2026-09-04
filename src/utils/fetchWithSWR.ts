import axios from 'axios'
import useSWRInfinite from 'swr/infinite'

import type { OdAPIResponse } from '../types'

// Common axios fetch function for use with useSWR
export async function fetcher([url]: [url: string]): Promise<any> {
  try {
    return (await axios.get(url)).data
  } catch (err: any) {
    throw {
      status: err?.response?.status ?? 0,
      message: err?.response?.data ?? { error: err?.message ?? 'Network request failed.' },
    }
  }
}

/**
 * Paging with useSWRInfinite + protected token support
 * @param path Current query directory path
 * @returns useSWRInfinite API
 */
export function useProtectedSWRInfinite(path: string = '') {
  /**
   * Next page infinite loading for useSWR
   * @param pageIdx The index of this paging collection
   * @param prevPageData Previous page information
   * @param path Directory path
   * @returns API to the next page
   */
  function getNextKey(pageIndex: number, previousPageData: OdAPIResponse): (string | null)[] | null {
    // Reached the end of the collection
    if (previousPageData && !previousPageData.folder) return null

    // First page with no prevPageData
    if (pageIndex === 0) return [`/api/?path=${path}`]

    if (!previousPageData.next) return null

    // Add nextPage token to API endpoint
    return [`/api/?path=${path}&next=${encodeURIComponent(previousPageData.next)}`]
  }

  // Disable auto-revalidate, these options are equivalent to useSWRImmutable
  // https://swr.vercel.app/docs/revalidation#disable-automatic-revalidations
  const revalidationOptions = {
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
  }
  return useSWRInfinite(getNextKey, fetcher, revalidationOptions)
}
