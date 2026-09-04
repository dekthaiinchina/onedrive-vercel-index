import axios from 'axios'

import apiConfig from '../../config/api.config'

function getClientSecret(): string {
  return process.env.CLIENT_SECRET ?? ''
}

export async function requestTokenWithAuthCode(code: string): Promise<{
  accessToken: string
  refreshToken: string
  expiresIn: number
}> {
  const clientSecret = getClientSecret()
  if (!apiConfig.clientId || !clientSecret) {
    throw new Error('OAuth is not configured. Set clientId and the server-only CLIENT_SECRET environment variable.')
  }

  const params = new URLSearchParams({
    client_id: apiConfig.clientId,
    redirect_uri: apiConfig.redirectUri,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
  })

  const { data } = await axios.post(apiConfig.authApi, params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })

  if (!data?.access_token || !data?.refresh_token || !Number.isFinite(Number(data?.expires_in))) {
    throw new Error('The OAuth provider returned an incomplete token response.')
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: Number(data.expires_in),
  }
}

export async function getAuthPersonInfo(accessToken: string) {
  const profileApi = apiConfig.driveApi.replace('/drive', '')
  return axios.get(profileApi, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

export function getServerClientSecret(): string {
  return getClientSecret()
}
