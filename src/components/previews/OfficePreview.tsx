import type { OdFileObject } from '../../types'
import { FC } from 'react'
import { useRouter } from 'next/router'

import DownloadButtonGroup from '../DownloadBtnGtoup'
import { DownloadBtnContainer } from './Containers'
import { getBaseUrl } from '../../utils/getBaseUrl'
import { matchProtectedRoute } from '../../utils/protectedRouteHandler'

const OfficePreview: FC<{ file: OdFileObject }> = ({ file }) => {
  const { asPath } = useRouter()
  const protectedFile = Boolean(matchProtectedRoute(asPath))

  const docUrl = encodeURIComponent(`${getBaseUrl()}/api/raw/?path=${asPath}`)

  return (
    <div>
      <div className="overflow-scroll" style={{ maxHeight: '90vh' }}>
        {protectedFile ? (
          <p className="p-6 text-center text-sm text-gray-500">
            Online Office preview is disabled for protected files to avoid disclosing your session to a third party.
          </p>
        ) : (
          <iframe
            className="h-[600px] w-full border-0"
            src={`https://view.officeapps.live.com/op/embed.aspx?src=${docUrl}`}
            title={`Preview of ${file.name}`}
          />
        )}
      </div>
      <DownloadBtnContainer>
        <DownloadButtonGroup />
      </DownloadBtnContainer>
    </div>
  )
}

export default OfficePreview
