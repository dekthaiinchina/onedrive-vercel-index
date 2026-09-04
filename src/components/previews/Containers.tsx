import type { ReactElement, ReactNode } from 'react'

export function PreviewContainer({ children }: { children: ReactNode }): ReactElement {
  return <div className="rounded bg-white p-3 shadow-sm dark:bg-gray-900 dark:text-white">{children}</div>
}

export function DownloadBtnContainer({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="bg-opacity-80 sticky right-0 bottom-0 left-0 z-10 rounded border-t border-gray-900/10 bg-white p-2 shadow-sm backdrop-blur-md dark:border-gray-500/30 dark:bg-gray-900">
      {children}
    </div>
  )
}
