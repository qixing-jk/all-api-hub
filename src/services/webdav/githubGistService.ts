import {
  CLOUD_SYNC_ERROR_CODES,
  type GitHubGistSettings,
} from "~/types/cloudSync"
import type { WebDAVSettings } from "~/types/webdav"

import {
  GitHubGistError,
  readGithubGistRawFile,
  requestGithubGistJson,
} from "./githubGistHttp"
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

export interface GitHubGistRemote {
  gistId: string
  htmlUrl: string
  public: boolean
  revision: string
  rawContent: string
}

interface GitHubGistSyncConfig extends GitHubGistSettings {
  encryptionPassword: string
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
    await requestGithubGistJson<unknown>({
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
    rawContent = await readGithubGistRawFile(file.raw_url, token)
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
async function createGithubGistBackup(
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
    await requestGithubGistJson<unknown>({
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
  let current: GitHubGistRemote | undefined
  try {
    current = await readGithubGistRemote({ token, gistId })
  } catch (error) {
    if (!isGithubGistWritableMissingError(error)) throw error
    if (params.expectedRevision) {
      throw new GitHubGistError(
        "The GitHub Gist changed on another device",
        CLOUD_SYNC_ERROR_CODES.CONFLICT,
      )
    }
  }
  if (
    params.expectedRevision &&
    current?.revision &&
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

  await requestGithubGistJson<GitHubGistApiResponse>({
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

/** Whether a configured Gist can be initialized or replaced by an upload. */
export function isGithubGistWritableMissingError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const code = (error as { code?: unknown }).code
  return (
    code === CLOUD_SYNC_ERROR_CODES.UNINITIALIZED ||
    code === CLOUD_SYNC_ERROR_CODES.REMOTE_EMPTY
  )
}
