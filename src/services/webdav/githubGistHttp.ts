import {
  CLOUD_SYNC_ERROR_CODES,
  type CloudSyncErrorCode,
} from "~/types/cloudSync"
import { sanitizeSensitiveErrorText } from "~/utils/core/sanitizeSensitiveErrorText"

const GITHUB_GIST_API_ORIGIN = "https://api.github.com"
const GITHUB_GIST_API_VERSION = "2022-11-28"

export class GitHubGistError extends Error {
  override readonly name = "GitHubGistError"

  constructor(
    message: string,
    readonly code: CloudSyncErrorCode,
    readonly statusCode?: number,
    readonly retryAt?: number,
    readonly requestId?: string,
  ) {
    super(message)
    Object.setPrototypeOf(this, GitHubGistError.prototype)
  }
}

/** Convert GitHub rate-limit headers into a retry timestamp when available. */
function readRetryAt(response: Response): number | undefined {
  const retryAfter = Number(response.headers.get("retry-after"))
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Date.now() + retryAfter * 1000
  }

  const reset = Number(response.headers.get("x-ratelimit-reset"))
  if (Number.isFinite(reset) && reset > 0) return reset * 1000
  return undefined
}

/** Preserve GitHub's error message and transport metadata without status mapping. */
async function readHttpError(
  response: Response,
  token: string,
): Promise<GitHubGistError> {
  let message = `GitHub request failed (HTTP ${response.status})`
  try {
    const body: unknown = await response.json()
    if (
      body &&
      typeof body === "object" &&
      "message" in body &&
      typeof body.message === "string" &&
      body.message.trim()
    ) {
      message = body.message.trim()
    }
  } catch {
    // Raw-file hosts and proxies may return non-JSON errors.
  }
  return new GitHubGistError(
    sanitizeSensitiveErrorText(
      token ? message.replaceAll(token, "[REDACTED]") : message,
    ),
    CLOUD_SYNC_ERROR_CODES.REMOTE_UNAVAILABLE,
    response.status,
    readRetryAt(response),
    response.headers.get("x-github-request-id") ?? undefined,
  )
}

/** Issue an authenticated GitHub API request and parse its JSON response. */
export async function requestGithubGistJson<T>(params: {
  path: string
  token: string
  method?: "GET" | "POST" | "PATCH"
  body?: unknown
}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${GITHUB_GIST_API_ORIGIN}${params.path}`, {
      method: params.method ?? "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${params.token}`,
        "X-GitHub-Api-Version": GITHUB_GIST_API_VERSION,
        ...(params.body ? { "Content-Type": "application/json" } : {}),
      },
      body: params.body ? JSON.stringify(params.body) : undefined,
    })
  } catch {
    throw new GitHubGistError(
      "Unable to reach GitHub",
      CLOUD_SYNC_ERROR_CODES.NETWORK,
    )
  }

  const requestId = response.headers.get("x-github-request-id") ?? undefined
  if (!response.ok) throw await readHttpError(response, params.token)

  try {
    return (await response.json()) as T
  } catch {
    throw new GitHubGistError(
      "GitHub returned an invalid response",
      CLOUD_SYNC_ERROR_CODES.REMOTE_UNAVAILABLE,
      response.status,
      undefined,
      requestId,
    )
  }
}

/** Read a truncated Gist file only from GitHub's raw-content host. */
export async function readGithubGistRawFile(
  rawUrl: string,
  token: string,
): Promise<string> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new GitHubGistError(
      "GitHub returned an invalid raw file URL",
      CLOUD_SYNC_ERROR_CODES.REMOTE_CORRUPTED,
    )
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "gist.githubusercontent.com"
  ) {
    throw new GitHubGistError(
      "GitHub returned an unsafe raw file URL",
      CLOUD_SYNC_ERROR_CODES.REMOTE_CORRUPTED,
    )
  }

  let response: Response
  try {
    response = await fetch(url.toString(), {
      headers: {
        Accept: "text/plain",
        Authorization: `Bearer ${token}`,
      },
    })
  } catch {
    throw new GitHubGistError(
      "Unable to download the GitHub Gist file",
      CLOUD_SYNC_ERROR_CODES.NETWORK,
    )
  }
  if (!response.ok) throw await readHttpError(response, token)
  const content = await response.text()
  if (!content.trim()) {
    throw new GitHubGistError(
      "The GitHub Gist file is empty",
      CLOUD_SYNC_ERROR_CODES.REMOTE_EMPTY,
    )
  }
  return content
}
