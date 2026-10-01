import {
  request,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test"

import { generateNewApiTotpCode } from "~/services/managedSites/providers/newApiTotp"
import {
  extractCompatibleApiPayload,
  type CompatibleApiRealSiteConfig,
} from "~~/e2e/utils/realSite/compatibleApi"
import { normalizeBaseUrl } from "~~/e2e/utils/realSite/shared"

/**
 * Bounds the scoped access tokens the real-site flows leave on a deployment.
 *
 * A rc.41 deployment caps a user at 20 scoped access tokens and shows each
 * plaintext once, so a fresh browser profile cannot reuse what an earlier run
 * created: every run adds a token and the account eventually refuses to issue
 * more. This deletes what earlier runs left behind.
 *
 * Only tokens older than {@link STALE_ACCESS_TOKEN_AGE_MS} are removed, because
 * the real-site matrix runs several jobs against one account in parallel and
 * each job's token has to survive until that job finishes.
 */
export const E2E_ACCESS_TOKEN_NAME = "All API Hub e2e"

const STALE_ACCESS_TOKEN_AGE_MS = 60 * 60 * 1000
const ACCESS_TOKENS_PATH = "/api/user/access_tokens"
const ACCESS_TOKEN_REVOKE_SCOPE = "access_token.revoke"

interface AccessTokenRow {
  id: number
  name: string
  /** Epoch seconds, as the deployment reports it. */
  created_at: number
}

/** Reads the envelope payload, or undefined for any non-success answer. */
async function readPayload<T>(response: APIResponse): Promise<T | undefined> {
  if (!response.ok()) return undefined
  try {
    return (
      (extractCompatibleApiPayload(await response.json()) as T) ?? undefined
    )
  } catch {
    return undefined
  }
}

/** Lists the caller's scoped access tokens, or nothing when the site is older. */
async function listAccessTokens(
  api: APIRequestContext,
  baseUrl: string,
  authorization: string,
): Promise<AccessTokenRow[] | undefined> {
  const response = await api.get(`${baseUrl}${ACCESS_TOKENS_PATH}`, {
    headers: { authorization, accept: "application/json" },
  })

  const payload = await readPayload<{ items?: AccessTokenRow[] }>(response)
  return payload?.items
}

/**
 * Exchanges the account password for the one-time proof a revoke requires.
 * A scoped token cannot manage tokens, so this always uses a browser session.
 */
async function requestRevokeProof(
  api: APIRequestContext,
  baseUrl: string,
  authorization: string,
  password: string,
  tokenId: number,
): Promise<string | undefined> {
  const response = await api.post(`${baseUrl}/api/verify`, {
    headers: {
      authorization,
      "content-type": "application/json",
      accept: "application/json",
    },
    data: {
      method: "password",
      scope: ACCESS_TOKEN_REVOKE_SCOPE,
      context: { token_id: tokenId },
      password,
    },
  })

  const payload = await readPayload<{ proof_token?: string }>(response)
  return payload?.proof_token
}

async function revokeAccessToken(
  api: APIRequestContext,
  baseUrl: string,
  authorization: string,
  tokenId: number,
  proof: string,
): Promise<boolean> {
  const response = await api.delete(
    `${baseUrl}${ACCESS_TOKENS_PATH}/${tokenId}`,
    {
      headers: {
        authorization,
        accept: "application/json",
        "X-Security-Proof": proof,
      },
    },
  )

  return response.ok()
}

/**
 * Deletes the e2e access tokens earlier runs left on one deployment.
 *
 * Best effort: a deployment that does not own the scoped routes, or that
 * refuses the login, leaves nothing to clean and must not fail the flow that
 * called it.
 * @param config Real-site deployment configuration.
 * @param now Injectable clock for tests.
 * @returns Tokens that were confirmed deleted.
 */
export async function revokeStaleE2eAccessTokens(
  config: Pick<
    CompatibleApiRealSiteConfig,
    | "baseUrl"
    | "username"
    | "password"
    | "loginApiUrl"
    | "login2faApiUrl"
    | "totpSecret"
  >,
  now: number = Date.now(),
): Promise<number[]> {
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  const revoked: number[] = []
  let api: APIRequestContext | undefined

  try {
    // Keep challenge cookies in an isolated jar; native fetch does not carry
    // the login session into the second-factor request in Node.
    api = await request.newContext()
    const login = await api.post(config.loginApiUrl, {
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      data: {
        username: config.username,
        password: config.password,
      },
    })
    let session = await readPayload<{
      access_token?: string
      require_2fa?: boolean
    }>(login)
    if (session?.require_2fa) {
      if (!config.totpSecret) {
        console.warn(
          "Access-token cleanup skipped: login requires a configured TOTP secret.",
        )
        return revoked
      }
      session = await readPayload(
        await api.post(config.login2faApiUrl, {
          data: { code: generateNewApiTotpCode(config.totpSecret) },
        }),
      )
    }
    const token = session?.access_token?.trim()
    if (!token) {
      console.warn(
        "Access-token cleanup skipped: login did not provide a session token.",
      )
      return revoked
    }

    const authorization = `Bearer ${token}`
    const tokens = await listAccessTokens(api, baseUrl, authorization)
    if (!tokens) return revoked

    const staleBeforeSeconds = Math.floor(
      (now - STALE_ACCESS_TOKEN_AGE_MS) / 1000,
    )
    for (const candidate of tokens) {
      if (
        candidate.name !== E2E_ACCESS_TOKEN_NAME ||
        !Number.isFinite(candidate.created_at) ||
        candidate.created_at >= staleBeforeSeconds
      ) {
        continue
      }

      const proof = await requestRevokeProof(
        api,
        baseUrl,
        authorization,
        config.password,
        candidate.id,
      )
      if (!proof) continue

      if (
        await revokeAccessToken(
          api,
          baseUrl,
          authorization,
          candidate.id,
          proof,
        )
      ) {
        revoked.push(candidate.id)
      }
    }
  } catch {
    console.warn(
      "Access-token cleanup skipped: a request or authentication step failed.",
    )
    return revoked
  } finally {
    await api?.dispose()
  }

  return revoked
}
