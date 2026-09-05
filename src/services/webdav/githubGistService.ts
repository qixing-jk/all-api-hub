import {
  CLOUD_SYNC_ERROR_CODES,
  type CloudSyncErrorCode,
  type GitHubGistSettings,
} from "~/types/cloudSync"
import type { WebDAVSettings } from "~/types/webdav"

import {
  decryptWebdavBackupEnvelope,
  encryptWebdavBackupContent,
  tryParseEncryptedWebdavBackupEnvelope,
} from "./webdavBackupEncryption"

/**
 * GitHub REST Gists API contract: create/update requests use `public: false`
 * and a `files` map; reads expose the file content (or `raw_url` when
 * truncated). See https://docs.github.com/en/rest/gists/gists.
 */
export const GITHUB_GIST_BACKUP_FILE_NAME = "all-api-hub-backup.json"
export const GITHUB_GIST_API_ORIGIN = "https://api.github.com"
export const GITHUB_GIST_API_VERSION = "2022-11-28"

export interface GitHubGistRemote {
  gistId: string
  htmlUrl: string
  public: boolean
  revision: string
  rawContent: string
}

export interface GitHubGistSyncConfig extends GitHubGistSettings {
  encryptionPassword: string
}

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

/** Build a stable configuration error without exposing token contents. */
function configError(message = "GitHub Gist configuration is incomplete") {
  return new GitHubGistError(message, CLOUD_SYNC_ERROR_CODES.CONFIG_INCOMPLETE)
}

/** Accept either a bare Gist ID or a gist.github.com URL. */
function normalizeGistId(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw configError("Enter a GitHub Gist URL or ID")

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed)
      if (
        url.hostname !== "gist.github.com" &&
        url.hostname !== "www.gist.github.com"
      ) {
        throw configError("Enter a GitHub Gist URL or ID")
      }
      const parts = url.pathname.split("/").filter(Boolean)
      const id = parts.at(-1) ?? ""
      if (id) return normalizeGistId(id)
    } catch (error) {
      if (error instanceof GitHubGistError) throw error
      throw configError("Enter a valid GitHub Gist URL or ID")
    }
  }

  if (!/^[A-Za-z0-9_-]{1,128}$/.test(trimmed)) {
    throw configError("Enter a valid GitHub Gist ID")
  }
  return trimmed
}

/** Validate the token and normalize the required Gist identifier. */
function getRequiredConfig(config: Partial<GitHubGistSyncConfig>) {
  const token = config.token?.trim() ?? ""
  if (!token) throw configError("Enter a GitHub Token")
  const gistId = normalizeGistId(config.gistId ?? "")
  return { token, gistId }
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

/** Map GitHub HTTP failures to actionable provider error categories. */
function mapHttpError(response: Response, requestId?: string): GitHubGistError {
  const retryAt = readRetryAt(response)
  const remaining = response.headers.get("x-ratelimit-remaining")
  const hasRetryAfter = response.headers.get("retry-after") !== null
  const isRateLimited =
    response.status === 429 ||
    (response.status === 403 &&
      ((remaining !== null && remaining === "0") || hasRetryAfter))

  if (isRateLimited) {
    return new GitHubGistError(
      "GitHub API rate limit reached",
      CLOUD_SYNC_ERROR_CODES.RATE_LIMITED,
      response.status,
      retryAt,
      requestId,
    )
  }
  if (response.status === 401) {
    return new GitHubGistError(
      "GitHub Token is invalid or expired",
      CLOUD_SYNC_ERROR_CODES.INVALID_TOKEN,
      response.status,
      undefined,
      requestId,
    )
  }
  if (response.status === 403) {
    return new GitHubGistError(
      "GitHub Token does not have permission to access this Gist",
      CLOUD_SYNC_ERROR_CODES.PERMISSION_DENIED,
      response.status,
      undefined,
      requestId,
    )
  }
  if (response.status === 404) {
    return new GitHubGistError(
      "GitHub Gist was not found or is not accessible",
      CLOUD_SYNC_ERROR_CODES.NOT_FOUND,
      response.status,
      undefined,
      requestId,
    )
  }
  if (response.status >= 500) {
    return new GitHubGistError(
      "GitHub is temporarily unavailable",
      CLOUD_SYNC_ERROR_CODES.REMOTE_UNAVAILABLE,
      response.status,
      undefined,
      requestId,
    )
  }
  return new GitHubGistError(
    "GitHub Gist request was rejected",
    CLOUD_SYNC_ERROR_CODES.REMOTE_UNAVAILABLE,
    response.status,
    undefined,
    requestId,
  )
}

/** Issue an authenticated GitHub API request and parse its JSON response. */
async function requestJson<T>(params: {
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
  if (!response.ok) throw mapHttpError(response, requestId)

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
async function readRawUrl(rawUrl: string, token: string): Promise<string> {
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
  if (!response.ok) throw mapHttpError(response)
  const content = await response.text()
  if (!content.trim()) {
    throw new GitHubGistError(
      "The GitHub Gist file is empty",
      CLOUD_SYNC_ERROR_CODES.REMOTE_EMPTY,
    )
  }
  return content
}

interface GitHubGistApiFile {
  content?: unknown
  raw_url?: unknown
  truncated?: unknown
}

interface GitHubGistApiResponse {
  id?: unknown
  html_url?: unknown
  public?: unknown
  updated_at?: unknown
  history?: Array<{ version?: unknown }>
  files?: Record<string, GitHubGistApiFile | null>
}

/** Check the top-level shape returned by the Gists API. */
function isGitHubGistApiResponse(
  value: unknown,
): value is GitHubGistApiResponse {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

/** Reject successful-but-invalid API responses before using their fields. */
function requireGitHubGistApiResponse(value: unknown): GitHubGistApiResponse {
  if (!isGitHubGistApiResponse(value)) {
    throw new GitHubGistError(
      "GitHub returned an invalid Gist response",
      CLOUD_SYNC_ERROR_CODES.REMOTE_CORRUPTED,
    )
  }
  return value
}

/** Prefer the immutable Gist history revision for optimistic checks. */
function getRevision(data: GitHubGistApiResponse): string {
  const historyRevision = data.history?.[0]?.version
  if (typeof historyRevision === "string" && historyRevision)
    return historyRevision
  return typeof data.updated_at === "string" ? data.updated_at : ""
}

/** Read and validate the metadata/file presence of an existing Secret Gist. */
export async function readGithubGistRemote(
  config: Pick<GitHubGistSyncConfig, "token" | "gistId">,
): Promise<GitHubGistRemote> {
  const { token, gistId } = getRequiredConfig(config)
  const data = requireGitHubGistApiResponse(
    await requestJson<unknown>({
      path: `/gists/${encodeURIComponent(gistId)}`,
      token,
    }),
  )

  if (
    typeof data.public !== "boolean" ||
    !data.files ||
    typeof data.files !== "object"
  ) {
    throw new GitHubGistError(
      "GitHub returned an incomplete Gist response",
      CLOUD_SYNC_ERROR_CODES.REMOTE_CORRUPTED,
    )
  }

  if (data.public !== false) {
    throw new GitHubGistError(
      "Only Secret Gists can be used for cloud backups",
      CLOUD_SYNC_ERROR_CODES.PUBLIC_GIST,
    )
  }

  const file = data.files?.[GITHUB_GIST_BACKUP_FILE_NAME]
  if (!file) {
    throw new GitHubGistError(
      "This Gist has not been initialized by All API Hub",
      CLOUD_SYNC_ERROR_CODES.UNINITIALIZED,
    )
  }

  let rawContent: string
  if (file.truncated === true) {
    if (typeof file.raw_url !== "string") {
      throw new GitHubGistError(
        "The GitHub Gist file is truncated and has no raw URL",
        CLOUD_SYNC_ERROR_CODES.REMOTE_CORRUPTED,
      )
    }
    rawContent = await readRawUrl(file.raw_url, token)
  } else if (typeof file.content === "string") {
    rawContent = file.content
  } else {
    throw new GitHubGistError(
      "The GitHub Gist file has no readable content",
      CLOUD_SYNC_ERROR_CODES.REMOTE_CORRUPTED,
    )
  }

  if (!rawContent.trim()) {
    throw new GitHubGistError(
      "The GitHub Gist file is empty",
      CLOUD_SYNC_ERROR_CODES.REMOTE_EMPTY,
    )
  }

  const htmlUrl = typeof data.html_url === "string" ? data.html_url : ""
  const responseId = typeof data.id === "string" ? data.id : gistId
  return {
    gistId: responseId,
    htmlUrl,
    public: false,
    revision: getRevision(data),
    rawContent,
  }
}

/** Verify that a token can read a Secret Gist without changing it. */
export async function testGithubGistConnection(
  config: Pick<GitHubGistSyncConfig, "token" | "gistId">,
) {
  return readGithubGistRemote(config)
}

/** Create a Secret Gist containing the already encrypted first backup. */
export async function createGithubGistBackup(
  content: string,
  config: GitHubGistSyncConfig,
): Promise<GitHubGistRemote> {
  const token = config.token.trim()
  if (!token) throw configError("Enter a GitHub Token")
  if (!content.trim()) {
    throw new GitHubGistError(
      "Cannot create an empty cloud backup",
      CLOUD_SYNC_ERROR_CODES.REMOTE_EMPTY,
    )
  }

  const data = requireGitHubGistApiResponse(
    await requestJson<unknown>({
      path: "/gists",
      method: "POST",
      token,
      body: {
        description: "All API Hub encrypted cloud backup",
        public: false,
        files: {
          [GITHUB_GIST_BACKUP_FILE_NAME]: { content },
        },
      },
    }),
  )
  if (data.public !== false || typeof data.id !== "string") {
    throw new GitHubGistError(
      "GitHub did not create a Secret Gist",
      CLOUD_SYNC_ERROR_CODES.REMOTE_UNAVAILABLE,
    )
  }
  return readGithubGistRemote({ token, gistId: data.id })
}

/** Update one file only, with a best-effort revision check and readback. */
export async function updateGithubGistBackup(params: {
  content: string
  config: Pick<GitHubGistSyncConfig, "token" | "gistId">
  expectedRevision?: string
}): Promise<GitHubGistRemote> {
  const { token, gistId } = getRequiredConfig(params.config)
  const current = await readGithubGistRemote({ token, gistId })
  if (
    params.expectedRevision &&
    current.revision &&
    params.expectedRevision !== current.revision
  ) {
    throw new GitHubGistError(
      "The GitHub Gist changed on another device",
      CLOUD_SYNC_ERROR_CODES.CONFLICT,
    )
  }
  if (!params.content.trim()) {
    throw new GitHubGistError(
      "Cannot upload an empty cloud backup",
      CLOUD_SYNC_ERROR_CODES.REMOTE_EMPTY,
    )
  }

  await requestJson<GitHubGistApiResponse>({
    path: `/gists/${encodeURIComponent(gistId)}`,
    method: "PATCH",
    token,
    body: {
      files: {
        [GITHUB_GIST_BACKUP_FILE_NAME]: { content: params.content },
      },
    },
  })

  const verified = await readGithubGistRemote({ token, gistId })
  if (verified.rawContent !== params.content) {
    throw new GitHubGistError(
      "GitHub Gist upload verification failed",
      CLOUD_SYNC_ERROR_CODES.REMOTE_CORRUPTED,
    )
  }
  return verified
}

/** Require and normalize the local password used for Gist encryption. */
function requireEncryptionPassword(config: GitHubGistSyncConfig): string {
  const password = config.encryptionPassword.trim()
  if (!password) {
    throw new GitHubGistError(
      "An encryption password is required for Secret Gist backups",
      CLOUD_SYNC_ERROR_CODES.ENCRYPTION_REQUIRED,
    )
  }
  return password
}

/** Download a Gist backup and decrypt it when it uses the supported envelope. */
export async function downloadGithubGistBackup(config: GitHubGistSyncConfig) {
  const remote = await readGithubGistRemote(config)
  const envelope = tryParseEncryptedWebdavBackupEnvelope(remote.rawContent)
  if (!envelope) return { content: remote.rawContent, remote }

  const password = requireEncryptionPassword(config)
  try {
    return {
      content: await decryptWebdavBackupEnvelope({ envelope, password }),
      remote,
    }
  } catch {
    throw new GitHubGistError(
      "The GitHub Gist backup could not be decrypted",
      CLOUD_SYNC_ERROR_CODES.REMOTE_CORRUPTED,
    )
  }
}

/** Encrypt and update an existing Gist backup. */
export async function uploadGithubGistBackup(
  content: string,
  config: GitHubGistSyncConfig,
  expectedRevision?: string,
) {
  const password = requireEncryptionPassword(config)
  const envelope = await encryptWebdavBackupContent({ content, password })
  return updateGithubGistBackup({
    content: JSON.stringify(envelope),
    config,
    expectedRevision,
  })
}

/** Encrypt and create a new Secret Gist with the first backup. */
export async function createEncryptedGithubGistBackup(
  content: string,
  config: GitHubGistSyncConfig,
) {
  const password = requireEncryptionPassword(config)
  const envelope = await encryptWebdavBackupContent({ content, password })
  return createGithubGistBackup(JSON.stringify(envelope), config)
}

/** Convert persisted settings into the provider request shape. */
export function getGithubGistSyncConfig(
  settings: WebDAVSettings,
): GitHubGistSyncConfig {
  return {
    ...(settings.githubGist ?? { token: "", gistId: "" }),
    encryptionPassword: settings.backupEncryptionPassword ?? "",
  }
}

/** Type guard for provider errors surfaced to UI and background callers. */
export function isGithubGistError(error: unknown): error is GitHubGistError {
  return error instanceof GitHubGistError
}
