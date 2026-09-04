import Head from 'next/head'
import Image from 'next/image'
import { useRouter } from 'next/router'
import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useTranslation } from 'next-i18next/pages'
import axios from 'axios'
import { serverSideTranslations } from 'next-i18next/pages/serverSideTranslations'

import siteConfig from '../../../config/site.config'
import Navbar from '../../components/Navbar'
import Footer from '../../components/Footer'

import { LoadingIcon } from '../../components/Loading'

export default function OAuthStep3({ authCode, error, description }) {
  const router = useRouter()

  const { t } = useTranslation()

  const [buttonContent, setButtonContent] = useState(
    <div>
      <span>{t('Store tokens')}</span> <FontAwesomeIcon icon="key" />
    </div>,
  )
  const [buttonError, setButtonError] = useState(false)

  const initialiseServer = async () => {
    setButtonError(false)
    setButtonContent(
      <div>
        <span>{t('Storing tokens')}</span> <LoadingIcon className="ml-1 inline h-4 w-4 animate-spin" />
      </div>,
    )

    await axios
      .post('/api', { authCode })
      .then(() => {
        setButtonError(false)
        setButtonContent(
          <div>
            <span>{t('Stored! Going home...')}</span> <FontAwesomeIcon icon="check" />
          </div>,
        )
        setTimeout(() => {
          router.push('/')
        }, 2000)
      })
      .catch(_ => {
        setButtonError(true)
        setButtonContent(
          <div>
            <span>{t('Error storing the token')}</span> <FontAwesomeIcon icon="exclamation-circle" />
          </div>,
        )
      })
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white dark:bg-gray-900">
      <Head>
        <title>{t('OAuth Step 3 - {{title}}', { title: siteConfig.title })}</title>
      </Head>

      <main className="flex w-full flex-1 flex-col bg-gray-50 dark:bg-gray-800">
        <Navbar />

        <div className="mx-auto w-full max-w-5xl p-4">
          <div className="rounded bg-white p-3 dark:bg-gray-900 dark:text-gray-100">
            <div className="mx-auto w-52">
              <Image
                src="/images/fabulous-celebration.png"
                width={912}
                height={912}
                alt="fabulous celebration"
                priority
              />
            </div>
            <h3 className="mb-4 text-center text-xl font-medium">
              {t('Welcome to your new onedrive-vercel-index 🎉')}
            </h3>

            <h3 className="mt-4 mb-2 text-lg font-medium">{t('Step 3/3: Get access and refresh tokens')}</h3>
            {error ? (
              <div>
                <p className="py-1 font-medium text-red-500">
                  <FontAwesomeIcon icon="exclamation-circle" className="mr-2" />
                  <span>
                    {t('Whoops, looks like we got a problem: {{error}}.', {
                      // t('No auth code present')
                      error: t(error),
                    })}
                  </span>
                </p>
                <p className="my-2 rounded border border-gray-400/20 bg-gray-50 p-2 font-mono text-sm whitespace-pre-line opacity-80 dark:bg-gray-800">
                  {
                    // t('Where is the auth code? Did you follow step 2 you silly donut?')
                    t(description)
                  }
                </p>
                <div className="mt-6 mb-2 text-right">
                  <button
                    className="rounded-lg bg-gradient-to-br from-red-500 to-orange-400 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-gradient-to-bl focus:ring-4 focus:ring-red-200 disabled:cursor-not-allowed disabled:grayscale dark:focus:ring-red-800"
                    onClick={() => {
                      router.push('/oauth/step-1')
                    }}
                  >
                    <FontAwesomeIcon icon="arrow-left" /> <span>{t('Restart')}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p className="py-1 font-medium">{t('The authorisation code is ready to be verified.')}</p>
                <p className="py-1">
                  {t(
                    'The server will exchange the code, verify the Microsoft account, and store the resulting tokens without exposing them to the browser.',
                  )}
                </p>

                <div className="mt-6 mb-2 text-right">
                  <button
                    className={`rounded-lg bg-gradient-to-br px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-gradient-to-bl focus:ring-4 ${
                      buttonError
                        ? 'from-red-500 to-orange-400 focus:ring-red-200 dark:focus:ring-red-800'
                        : 'from-green-500 to-teal-300 focus:ring-green-200 dark:focus:ring-green-800'
                    }`}
                    onClick={initialiseServer}
                  >
                    {buttonContent}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}

export async function getServerSideProps({ query, locale }) {
  const { authCode } = query

  // Return if no auth code is present
  if (!authCode) {
    return {
      props: {
        error: 'No auth code present',
        description: 'Where is the auth code? Did you follow step 2 you silly donut?',
        ...(await serverSideTranslations(locale, ['common'])),
      },
    }
  }

  return {
    props: {
      error: null,
      authCode: typeof authCode === 'string' ? authCode : '',
      ...(await serverSideTranslations(locale, ['common'])),
    },
  }
}
