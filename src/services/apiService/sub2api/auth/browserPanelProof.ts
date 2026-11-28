import { resolveDeploymentApiOrigin } from "~/constants/deploymentApiOrigins"
import {
  SUB2API_AUTH_ME_ENDPOINT,
  SUB2API_AUTH_REFRESH_ENDPOINT,
  SUB2API_PANEL_KEY_ERRORS,
} from "~/services/apiService/sub2api/type"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { isRecord } from "~/utils/core/object"
import { t } from "~/utils/i18n/core"

import {
  fetchSub2ApiPanelProofRequest,
  readSub2ApiPanelProofRejection,
  readSub2ApiPanelTokenBinding,
} from "./panelProofProtocol"

export const SUB2API_PANEL_MIDDLEWARE_OUTCOMES = {
  Proof: "proof",
  VerifiedOrdinary: "verified_ordinary",
  Inconclusive: "inconclusive",
} as const

type Sub2ApiPanelMiddlewareOutcome =
  (typeof SUB2API_PANEL_MIDDLEWARE_OUTCOMES)[keyof typeof SUB2API_PANEL_MIDDLEWARE_OUTCOMES]

/** An empty refresh request discovers middleware without rotating any family. */
export async function probeSub2ApiBrowserPanelMiddleware(
  apiOrigin: string,
): Promise<Sub2ApiPanelMiddlewareOutcome> {
  const response = await fetch(
    new URL(SUB2API_AUTH_REFRESH_ENDPOINT, apiOrigin),
    {
      method: "POST",
      credentials: "omit",
      redirect: "error",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: "" }),
    },
  ).catch(() => undefined)
  if (!response) return SUB2API_PANEL_MIDDLEWARE_OUTCOMES.Inconclusive
  if (await readSub2ApiPanelProofRejection(response))
    return SUB2API_PANEL_MIDDLEWARE_OUTCOMES.Proof
  if (response.status === 400) {
    const body: unknown = await response.json().catch(() => undefined)
    if (
      isRecord(body) &&
      body.code === 400 &&
      (body.reason == null || body.reason === "") &&
      (body.message === "Refresh token is required" ||
        body.message ===
          "Invalid request: Key: 'RefreshTokenRequest.RefreshToken' Error:Field validation for 'RefreshToken' failed on the 'required' tag")
    )
      return SUB2API_PANEL_MIDDLEWARE_OUTCOMES.VerifiedOrdinary
  }
  return SUB2API_PANEL_MIDDLEWARE_OUTCOMES.Inconclusive
}

/** Read the native v2 key in the website's origin; never create or replace it. */
async function readSub2ApiBrowserPanelKey(): Promise<
  CryptoKeyPair | undefined
> {
  if (typeof indexedDB === "undefined") return undefined
  return await new Promise((resolve, reject) => {
    const request = indexedDB.open("sub2api-panel-proof-v2")
    let absent = false
    request.onupgradeneeded = () => {
      absent = true
      request.transaction?.abort()
    }
    request.onerror = () =>
      absent ? resolve(undefined) : reject(request.error)
    request.onblocked = () =>
      reject(new Error("Website signing key storage blocked"))
    request.onsuccess = () => {
      const database = request.result
      try {
        if (!database.objectStoreNames.contains("keys")) {
          database.close()
          resolve(undefined)
          return
        }
        const read = database
          .transaction("keys")
          .objectStore("keys")
          .get("browser-signing-key")
        read.onsuccess = () => {
          database.close()
          resolve(read.result)
        }
        read.onerror = () => {
          database.close()
          reject(read.error)
        }
      } catch (error) {
        database.close()
        reject(error)
      }
    }
  })
}

/** Existing browser credentials stay in their original profile and key context. */
export async function fetchSub2ApiBrowserPanelRequest(
  url: string,
  options: RequestInit,
  dispatch: (options: RequestInit) => Promise<Response> = (init) =>
    fetch(url, init),
  keySnapshot?: { pair: CryptoKeyPair | undefined },
): Promise<Response> {
  const target = new URL(url, location.origin)
  const token = /^Bearer\s+(\S+)$/i.exec(
    new Headers(options.headers).get("Authorization") ?? "",
  )?.[1]
  if (
    (target.origin !== location.origin &&
      target.origin !==
        new URL(resolveDeploymentApiOrigin(location.origin)).origin) ||
    !token ||
    !readSub2ApiPanelTokenBinding(token)
  )
    return dispatch(options)
  const pair = keySnapshot
    ? keySnapshot.pair
    : await readSub2ApiBrowserPanelKey().catch(() => undefined)
  return fetchSub2ApiPanelProofRequest(target.href, options, dispatch, {
    read: async () => pair,
    get: async () => {
      if (pair) return pair
      throw new ApiError(
        t("messages:errors.api.browserProofLoginRequired"),
        401,
        target.pathname,
        API_ERROR_CODES.REQUEST_PROOF_INVALID,
        SUB2API_PANEL_KEY_ERRORS.WebsiteKeyMissing,
      )
    },
  })
}

/** Determine ownership and verify identity against a single native key read. */
export async function fetchSub2ApiBrowserSessionIdentity(
  apiOrigin: string,
  accessToken: string,
) {
  const pair = readSub2ApiPanelTokenBinding(accessToken)
    ? await readSub2ApiBrowserPanelKey().catch(() => undefined)
    : undefined
  const identityUrl = new URL(SUB2API_AUTH_ME_ENDPOINT, apiOrigin)
  const response = await fetchSub2ApiBrowserPanelRequest(
    identityUrl.href,
    {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    (options) => fetch(identityUrl, options),
    { pair },
  )
  if (response.url && new URL(response.url).origin !== identityUrl.origin)
    throw new Error("Sub2API identity response came from another origin")
  return { response, browserOwnsSession: Boolean(pair) }
}
