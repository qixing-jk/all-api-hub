import { fetchUserInfo } from "~/services/apiService/newApiFamily/default/accountBootstrap"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"

/** Reads an existing management token, leaving an empty token for manual recovery. */
export async function getAccessToken(request: ApiServiceRequest) {
  // https://api.apiyi.com/account/profile (v29.8.9): System token requires
  // POST /api/user/access_token/ with a password. Never use GET /api/user/token
  // or collect that password in the extension; verification stays on the site.
  return fetchUserInfo(request)
}

/** Retains verified account identity without adopting a generic profile token. */
export async function readGenericShellIdentity(
  request: ApiServiceRequest,
  expectedUserId?: string,
) {
  const identity = await fetchUserInfo(request, expectedUserId, {
    redirect: "error",
  })
  return {
    ...identity,
    access_token: "",
    user: { ...identity.user, access_token: null },
  }
}

/** Reuse a profile token only after an independent same-account token request. */
export async function getVerifiedShellAccessToken(request: ApiServiceRequest) {
  const identity = await fetchUserInfo(request, undefined, {
    redirect: "error",
  })
  const token =
    typeof identity.access_token === "string"
      ? identity.access_token.trim()
      : ""
  if (!token) return { ...identity, access_token: "" }
  await fetchUserInfo(
    {
      ...request,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: token,
        userId: identity.id,
      },
      cookieAuthSessionCookie: undefined,
      cookieSession: undefined,
      requestHeaders: undefined,
      allowAccountCredentialRecovery: false,
    },
    identity.id,
    { redirect: "error" },
  )
  return { ...identity, access_token: token }
}
