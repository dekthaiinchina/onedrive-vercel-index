import { useRouter } from 'next/router'
import { useTranslation } from 'next-i18next/pages'

import FourOhFour from '../FourOhFour'
import Loading from '../Loading'
import { DownloadButton } from '../DownloadBtnGtoup'
import useFileContent from '../../utils/fetchOnMount'
import { DownloadBtnContainer, PreviewContainer } from './Containers'

const parseDotUrl = (content: string): string | undefined => {
  const candidate = content
    .split('\n')
    .find(line => line.startsWith('URL='))
    ?.slice(4)
    .trim()
  if (!candidate) return undefined

  try {
    const url = new URL(candidate)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

const TextPreview = ({ file: _file }) => {
  const { asPath } = useRouter()
  const { t } = useTranslation()

  const { response: content, error, validating } = useFileContent(`/api/raw/?path=${asPath}`, asPath)
  if (error) {
    return (
      <PreviewContainer>
        <FourOhFour errorMsg={error} />
      </PreviewContainer>
    )
  }

  if (validating) {
    return (
      <PreviewContainer>
        <Loading loadingText={t('Loading file content...')} />
      </PreviewContainer>
    )
  }

  if (!content) {
    return (
      <PreviewContainer>
        <FourOhFour errorMsg={t('File is empty.')} />
      </PreviewContainer>
    )
  }

  return (
    <div>
      <PreviewContainer>
        <pre className="overflow-x-scroll p-0 text-sm md:p-3">{content}</pre>
      </PreviewContainer>
      <DownloadBtnContainer>
        <div className="flex justify-center">
          <DownloadButton
            onClickCallback={() => window.open(parseDotUrl(content) ?? '', '_blank', 'noopener,noreferrer')}
            btnColor="blue"
            btnText={t('Open URL')}
            btnIcon="external-link-alt"
            btnTitle={t('Open URL{{url}}', { url: ` ${parseDotUrl(content) ?? ''}` })}
          />
        </div>
      </DownloadBtnContainer>
    </div>
  )
}

export default TextPreview
