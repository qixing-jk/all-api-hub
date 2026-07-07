import { userPreferences } from "~/services/preferences/userPreferences"
import type { WebDAVConfig } from "~/types/webdav"
import { t } from "~/utils/i18n/core"

import {
  decryptWebdavBackupEnvelope,
  encryptWebdavBackupContent,
  tryParseEncryptedWebdavBackupEnvelope,
} from "./webdavBackupEncryption"

/**
 * Builds a Basic Authorization header value from WebDAV username and password.
 */
function buildAuthHeader(username: string, password: string) {
  const token = btoa(`${username}:${password}`)
  return `Basic ${token}`
}

/**
 * WebDAV backup path version string.
 *
 * This controls the default filename under the configured WebDAV directory.
 * It is intentionally separate from the backup schema version.
 */
const CONFIG_VERSION = "1-0"

/**
 * Jianguoyun/Nutstore returns this DAV exception inside a 409 XML payload when
 * a requested file's parent collection has not been created yet.
 */
const WEBDAV_ANCESTORS_NOT_FOUND_MARKER = "AncestorsNotFound"

/**
 * Program identifier used in default WebDAV backup paths.
 */
const PROGRAM_NAME = "all-api-hub"

export const WEBDAV_FILE_NOT_FOUND_ERROR_CODE = "WEBDAV_FILE_NOT_FOUND"

export class WebdavFileNotFoundError extends Error {
  readonly code = WEBDAV_FILE_NOT_FOUND_ERROR_CODE

  constructor(message: string = t("messages:webdav.fileNotFound")) {
    super(message)
    this.name = "WebdavFileNotFoundError"
    Object.setPrototypeOf(this, WebdavFileNotFoundError.prototype)
  }
}

/**
 * Parse a downloaded WebDAV backup payload and convert malformed JSON into a
 * stable user-facing backup error instead of exposing engine-specific parser text.
 */
export function parseWebdavBackupJson<T = unknown>(content: string): T {
  try {
    return JSON.parse(content) as T
  } catch {
    throw new Error(t("messages:webdav.invalidBackupJson"))
  }
}

class WebdavHttpError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message)
    this.name = "WebdavHttpError"
    Object.setPrototypeOf(this, WebdavHttpError.prototype)
  }
}

/**
 * Type guard to detect WebDAV file-not-found errors, which may be represented
 * @param error - The error object to check
 */
export function isWebdavFileNotFoundError(
  error: unknown,
): error is WebdavFileNotFoundError {
  if (error instanceof WebdavFileNotFoundError) {
    return true
  }

  if (!error || typeof error !== "object") {
    return false
  }

  const candidate = error as { code?: unknown }
  return candidate.code === WEBDAV_FILE_NOT_FOUND_ERROR_CODE
}

/**
 * Default WebDAV collection/directory name used for backups.
 */
const BACKUP_FOLDER_NAME = `${PROGRAM_NAME}-backup`
const STALE_TEMP_MAX_AGE_MS = 24 * 60 * 60 * 1000

/**
 * Ensures the configured WebDAV URL points to a concrete JSON backup file path.
 *
 * Supported inputs:
 * - Full file URL (e.g. `.../all-api-hub-backup/all-api-hub-1-0.json`)
 * - Directory-like URL (e.g. `.../webdav/`) which will be expanded to a
 *   deterministic filename under `all-api-hub-backup/`.
 */
function ensureFilename(url: string, version: string = CONFIG_VERSION) {
  try {
    // If it's clearly a directory or missing extension, append default filename
    const hasJson = /\.json($|\?)/i.test(url)
    const endsWithSlash = /\/$/.test(url)
    if (hasJson) return url
    const sep = endsWithSlash ? "" : "/"
    return `${url}${sep}${BACKUP_FOLDER_NAME}/${PROGRAM_NAME}-${version}.json`
  } catch {
    return url
  }
}

/**
 * Resolves the endpoint used for connection checks.
 *
 * For directory-style settings, probe the configured collection itself instead
 * of the generated backup file path so first-time valid endpoints are not
 * rejected before the backup file exists.
 *
 * Both directory-style URLs (e.g., "http://host/webdav/") and file-style URLs
 * (e.g., "http://host/webdav/backup.json") are returned unchanged, ensuring
 * connection tests probe the user's exact configuration.
 */
function resolveConnectionTestUrl(url: string) {
  return url
}

/**
 * Detects explicit backup file URLs so connection checks can keep the legacy
 * GET probe for file paths while using a WebDAV-native probe for collections.
 */
function isExplicitWebdavJsonFileUrl(url: string) {
  try {
    return new URL(url).pathname.toLowerCase().endsWith(".json")
  } catch {
    return /\.json($|[?#])/i.test(url)
  }
}

/**
 * Derives the backup directory URL from a fully-qualified backup target URL.
 *
 * Used so we can create the collection via `MKCOL` before uploading.
 */
function getBackupDirUrl(targetUrl: string) {
  // derive the .../all-api-hub-backup/ directory from final target URL
  const marker = `${BACKUP_FOLDER_NAME}/`
  const idx = targetUrl.indexOf(marker)
  if (idx === -1) {
    // fallback: use dirname of target
    const cut = targetUrl.lastIndexOf("/")
    return cut > 0 ? targetUrl.slice(0, cut) : targetUrl
  }
  return targetUrl.slice(0, idx + marker.length - 1) // include trailing slash
}

/**
 * Extracts the final path segment from a backup target URL.
 */
function getBackupFileName(targetUrl: string) {
  const cleanUrl = targetUrl.split(/[?#]/, 1)[0]
  const cut = cleanUrl.lastIndexOf("/")
  return cut >= 0 ? cleanUrl.slice(cut + 1) : cleanUrl
}

/**
 * Appends an encoded file name to a WebDAV collection URL.
 */
function joinWebdavUrl(baseUrl: string, fileName: string) {
  const sep = baseUrl.endsWith("/") ? "" : "/"
  return `${baseUrl}${sep}${encodeURIComponent(fileName)}`
}

/**
 * Encodes WebDAV URLs before they are placed in request headers.
 *
 * Browser header values are ByteStrings, so non-ASCII path segments such as
 * Jianguoyun/Nutstore Chinese folder names must be percent-encoded first.
 */
function encodeWebdavHeaderUrl(url: string) {
  try {
    return new URL(url).toString()
  } catch {
    return encodeURI(url)
  }
}

/**
 * Creates a compact UTC timestamp for temporary backup names.
 */
function createTimestampForTempFile(now: number = Date.now()) {
  return new Date(now)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z")
}

/**
 * Creates the stable prefix used for safe-commit temporary files.
 */
function createSafeCommitTempPrefix(targetUrl: string) {
  const officialName =
    getBackupFileName(targetUrl) || `${PROGRAM_NAME}-${CONFIG_VERSION}.json`
  return `${officialName}.tmp.`
}

/**
 * Creates the hidden temp prefix used by older builds.
 */
function createLegacySafeCommitTempPrefix(targetUrl: string) {
  return `.${createSafeCommitTempPrefix(targetUrl)}`
}

/**
 * Creates a short random suffix to avoid temp-file collisions.
 */
function createRandomTempSuffix() {
  const cryptoLike = globalThis.crypto
  if (cryptoLike?.getRandomValues) {
    const bytes = new Uint8Array(6)
    cryptoLike.getRandomValues(bytes)
    return Array.from(bytes, (byte) => byte.toString(36).padStart(2, "0")).join(
      "",
    )
  }

  return Math.random().toString(36).slice(2, 14)
}

/**
 * Creates a temporary backup URL in the same WebDAV collection as the target.
 */
function createTempBackupUrl(targetUrl: string) {
  const dirUrl = getBackupDirUrl(targetUrl)
  const tempName = `${createSafeCommitTempPrefix(
    targetUrl,
  )}${createTimestampForTempFile()}.${createRandomTempSuffix()}`
  return joinWebdavUrl(dirUrl, tempName)
}

/**
 * Creates the WebDAV backup directory if needed, tolerating already-existing paths.
 *
 * Note: WebDAV servers differ in their `MKCOL` behavior; this implementation is
 * deliberately permissive to avoid blocking backups on idiosyncratic responses.
 */
async function ensureBackupDirectory(
  targetUrl: string,
  username: string,
  password: string,
) {
  const dirUrl = getBackupDirUrl(targetUrl)
  // Some servers require MKCOL on the exact collection URL
  // Try MKCOL; 201 Created -> ok, 405/301/302 -> already exists/redirect, 409 -> parent not found
  const res = await fetch(dirUrl, {
    method: "MKCOL",
    headers: {
      Authorization: buildAuthHeader(username, password),
    },
  })
  if (
    res.status === 201 ||
    res.status === 405 ||
    (res.status >= 200 && res.status < 300)
  ) {
    return true
  }
  // Some servers respond 409 if parent exists but trailing slash missing; try again with slash
  if (!/\/$/.test(dirUrl)) {
    const res2 = await fetch(dirUrl + "/", {
      method: "MKCOL",
      headers: {
        Authorization: buildAuthHeader(username, password),
      },
    })
    if (
      res2.status === 201 ||
      res2.status === 405 ||
      (res2.status >= 200 && res2.status < 300)
    ) {
      return true
    }
  }
  // If still failing but directory may already exist, a HEAD could verify; we keep permissive to avoid blocking
  return true
}

/**
 * Reads WebDAV configuration from user preferences.
 */
async function getWebDavConfig(): Promise<WebDAVConfig> {
  const prefs = await userPreferences.getPreferences()
  return prefs.webdav
}

type WebdavBackupRequestOptions = {
  prepareForWrite?: boolean
}

type ResolvedWebdavBackupRequestContext = {
  cfg: WebDAVConfig
  targetUrl: string
}

/**
 * Resolves the effective WebDAV config and normalized backup target path.
 */
async function resolveWebdavBackupRequestContext(
  custom?: Partial<WebDAVConfig>,
): Promise<ResolvedWebdavBackupRequestContext> {
  const cfg = { ...(await getWebDavConfig()), ...custom }
  if (!cfg.url || !cfg.username || !cfg.password) {
    throw new Error(t("messages:webdav.configIncomplete"))
  }

  return {
    cfg,
    targetUrl: ensureFilename(cfg.url),
  }
}

/**
 * Prepares the backup collection for flows that are expected to upload later.
 *
 * This prevents first-time syncs from depending on provider-specific `GET`
 * responses when the backup directory has not been created yet.
 */
async function prepareWebdavBackupTargetForWrite(
  context: ResolvedWebdavBackupRequestContext,
) {
  await ensureBackupDirectory(
    context.targetUrl,
    context.cfg.username,
    context.cfg.password,
  )
}

/**
 * Uploads raw content to a WebDAV URL.
 */
async function putWebdavContent(params: {
  url: string
  username: string
  password: string
  content: string
}) {
  const res = await fetch(params.url, {
    method: "PUT",
    headers: {
      Authorization: buildAuthHeader(params.username, params.password),
      "Content-Type": "application/json",
    },
    body: params.content,
  })

  if (res.status >= 200 && res.status < 300) return true
  if (res.status === 401 || res.status === 403)
    throw new WebdavHttpError(t("messages:webdav.authFailed"), res.status)
  throw new WebdavHttpError(
    t("messages:webdav.uploadFailed", { status: res.status }),
    res.status,
  )
}

/**
 * Downloads raw content from a WebDAV URL.
 */
async function getWebdavContent(params: {
  url: string
  username: string
  password: string
  failureMessage?: string
}) {
  const res = await fetch(params.url, {
    method: "GET",
    headers: {
      Authorization: buildAuthHeader(params.username, params.password),
      Accept: "application/json",
    },
  })

  if (res.status >= 200 && res.status < 300) {
    return await res.text()
  }
  if (res.status === 401 || res.status === 403)
    throw new WebdavHttpError(t("messages:webdav.authFailed"), res.status)
  throw new WebdavHttpError(
    params.failureMessage ??
      t("messages:webdav.downloadFailed", { status: res.status }),
    res.status,
  )
}

/**
 * Moves a temporary WebDAV object to its final destination.
 */
async function moveWebdavContent(params: {
  sourceUrl: string
  destinationUrl: string
  username: string
  password: string
}) {
  const move = () =>
    fetch(params.sourceUrl, {
      method: "MOVE",
      headers: {
        Authorization: buildAuthHeader(params.username, params.password),
        Destination: encodeWebdavHeaderUrl(params.destinationUrl),
        Overwrite: "T",
      },
    })

  let res = await move()

  if (shouldRetryMoveAfterDeletingDestination(res.status)) {
    // RFC 4918 section 9.9.3 requires Overwrite:T to delete the destination
    // before MOVE. Some providers reject that overwrite step instead:
    // Nutstore returns 409 and cstcloud returns 500 when the destination exists.
    await deleteWebdavDestinationBeforeMoveRetry(params)
    res = await move()
  }

  if (res.status >= 200 && res.status < 300) return true
  if (res.status === 401 || res.status === 403)
    throw new WebdavHttpError(t("messages:webdav.authFailed"), res.status)
  throw new WebdavHttpError(t("messages:webdav.safeCommitFailed"), res.status)
}

/**
 * Detects provider overwrite failures that can safely retry after deleting the destination.
 */
function shouldRetryMoveAfterDeletingDestination(status: number) {
  return status === 409 || status === 500
}

/**
 * Applies the RFC-equivalent overwrite step when a provider rejects MOVE.
 */
async function deleteWebdavDestinationBeforeMoveRetry(params: {
  destinationUrl: string
  username: string
  password: string
}) {
  const res = await fetch(params.destinationUrl, {
    method: "DELETE",
    headers: {
      Authorization: buildAuthHeader(params.username, params.password),
    },
  })

  if ((res.status >= 200 && res.status < 300) || res.status === 404) {
    return true
  }
  if (res.status === 401 || res.status === 403) {
    throw new WebdavHttpError(t("messages:webdav.authFailed"), res.status)
  }
  throw new WebdavHttpError(t("messages:webdav.safeCommitFailed"), res.status)
}

/**
 * Deletes temporary WebDAV content without masking the primary error.
 */
async function deleteWebdavContentBestEffort(params: {
  url: string
  username: string
  password: string
}) {
  try {
    await fetch(params.url, {
      method: "DELETE",
      headers: {
        Authorization: buildAuthHeader(params.username, params.password),
      },
    })
  } catch {
    // Temp cleanup is best-effort; preserve the primary upload error.
  }
}

/**
 * Extracts href values from a WebDAV multistatus response.
 */
function parseWebdavHrefValues(xml: string) {
  return Array.from(xml.matchAll(/<[^>]*href[^>]*>([^<]+)<\/[^>]*href>/gi)).map(
    (match) => match[1],
  )
}

/**
 * Reads the UTC creation timestamp embedded in an app-owned temp backup name.
 */
function parseTempTimestampFromFileName(input: {
  fileName: string
  tempPrefix: string
}): number | null {
  const escapedPrefix = input.tempPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = new RegExp(
    `^${escapedPrefix}(\\d{8}T\\d{6}Z)\\.[a-z0-9]+$`,
  ).exec(input.fileName)
  if (!match) {
    return null
  }

  const raw = match[1]
  const year = Number(raw.slice(0, 4))
  const month = Number(raw.slice(4, 6))
  const day = Number(raw.slice(6, 8))
  const hour = Number(raw.slice(9, 11))
  const minute = Number(raw.slice(11, 13))
  const second = Number(raw.slice(13, 15))
  const timestamp = Date.UTC(year, month - 1, day, hour, minute, second)
  if (!Number.isFinite(timestamp)) {
    return null
  }

  const date = new Date(timestamp)
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    return null
  }

  return timestamp
}

/**
 * Resolves a WebDAV href against the configured backup collection URL.
 */
function resolveHrefToCollectionUrl(collectionUrl: string, href: string) {
  try {
    const normalizedCollection = new URL(
      collectionUrl.endsWith("/") ? collectionUrl : `${collectionUrl}/`,
    )
    const resolved = new URL(href, normalizedCollection)
    if (resolved.origin !== normalizedCollection.origin) {
      return null
    }

    const collectionPath = normalizedCollection.pathname.endsWith("/")
      ? normalizedCollection.pathname
      : `${normalizedCollection.pathname}/`
    if (!resolved.pathname.startsWith(collectionPath)) {
      return null
    }

    const relativePath = resolved.pathname.slice(collectionPath.length)
    if (!relativePath || relativePath.includes("/")) {
      return null
    }

    return resolved.toString()
  } catch {
    return null
  }
}

/**
 * Removes stale app-owned temp backups without blocking the current upload.
 */
async function cleanupStaleTempBackupsBestEffort(params: {
  collectionUrl: string
  tempPrefixes: string[]
  username: string
  password: string
  now?: number
}) {
  try {
    const res = await fetch(params.collectionUrl, {
      method: "PROPFIND",
      headers: {
        Authorization: buildAuthHeader(params.username, params.password),
        Depth: "1",
      },
    })
    if (res.status < 200 || res.status >= 300) {
      return
    }

    const body = await res.text()
    const now = params.now ?? Date.now()
    for (const href of parseWebdavHrefValues(body)) {
      const fileName = decodeURIComponent(
        href.split("/").filter(Boolean).pop() || "",
      )
      const createdAt = params.tempPrefixes
        .map((tempPrefix) =>
          parseTempTimestampFromFileName({
            fileName,
            tempPrefix,
          }),
        )
        .find((value): value is number => value !== null)
      if (createdAt === undefined || now - createdAt <= STALE_TEMP_MAX_AGE_MS) {
        continue
      }

      const tempUrl = resolveHrefToCollectionUrl(params.collectionUrl, href)
      if (!tempUrl) {
        continue
      }

      await deleteWebdavContentBestEffort({
        url: tempUrl,
        username: params.username,
        password: params.password,
      })
    }
  } catch {
    // Stale temp cleanup is maintenance only; uploads must not depend on it.
  }
}

/**
 * Detects "missing remote backup" responses across WebDAV providers.
 *
 * Jianguoyun/Nutstore returns `409 Conflict` with an XML body containing
 * `AncestorsNotFound` for a first-time GET before the backup directory exists.
 */
async function isMissingWebdavBackupResponse(
  response: Pick<Response, "status" | "text">,
) {
  if (response.status === 404) {
    return true
  }

  if (response.status !== 409) {
    return false
  }

  try {
    const body = await response.text()
    return body.includes(WEBDAV_ANCESTORS_NOT_FOUND_MARKER)
  } catch {
    return false
  }
}

/**
 * Read WebDAV backup encryption settings from user preferences.
 *
 * When enabled, uploads will wrap the backup JSON in an encrypted envelope.
 * Downloads will attempt to decrypt envelopes using the stored password.
 */
async function getWebdavEncryptionConfig() {
  const prefs = await userPreferences.getPreferences()
  return {
    enabled: Boolean(prefs.webdav.backupEncryptionEnabled),
    password: (prefs.webdav.backupEncryptionPassword || "").trim(),
  }
}

/**
 * Test connectivity and authentication against the configured WebDAV
 * endpoint.
 *
 * Explicit JSON file URLs keep the legacy GET probe so missing backup files
 * can still be treated as reachable. Collection-like URLs use PROPFIND with
 * Depth: 0 because some WebDAV providers reject collection GET while accepting
 * standard collection metadata probes.
 *
 * Any non-auth HTTP status in the 2xx–4xx range is treated as a successful
 * connectivity check. 401/403 are treated as authentication failures and 5xx
 * as connection errors.
 */
export async function testWebdavConnection(custom?: Partial<WebDAVConfig>) {
  const { cfg } = await resolveWebdavBackupRequestContext(custom)
  const targetUrl = resolveConnectionTestUrl(cfg.url)
  const usesFileProbe = isExplicitWebdavJsonFileUrl(targetUrl)

  const res = await fetch(targetUrl, {
    method: usesFileProbe ? "GET" : "PROPFIND",
    headers: {
      Authorization: buildAuthHeader(cfg.username, cfg.password),
      ...(usesFileProbe ? {} : { Depth: "0" }),
    },
  })
  // 401/403 明确表示鉴权失败
  if (res.status === 401 || res.status === 403)
    throw new WebdavHttpError(t("messages:webdav.authFailed"), res.status)
  // 其余 2xx–4xx（例如部分 WebDAV 服务返回的 405/409 等）视为网络可达且凭据大概率有效
  if (res.status >= 200 && res.status < 500) return true
  // 5xx 等错误仍视为连接失败，保留原有错误信息
  throw new WebdavHttpError(
    t("messages:webdav.connectionFailed", { status: res.status }),
    res.status,
  )
}

/**
 * Download the remote backup as raw text.
 *
 * This function does not attempt to detect or decrypt encrypted envelopes.
 * It is intended for UI flows that need to decide how to prompt the user when
 * no password is available or decryption fails. Pass `prepareForWrite` when
 * the caller is about to upload after reading the current remote payload.
 */
export async function downloadBackupRaw(
  custom?: Partial<WebDAVConfig>,
  options: WebdavBackupRequestOptions = {},
) {
  const context = await resolveWebdavBackupRequestContext(custom)
  const { cfg, targetUrl } = context

  if (options.prepareForWrite) {
    await prepareWebdavBackupTargetForWrite(context)
  }

  const res = await fetch(targetUrl, {
    method: "GET",
    headers: {
      Authorization: buildAuthHeader(cfg.username, cfg.password),
      Accept: "application/json",
    },
  })
  if (res.status >= 200 && res.status < 300) {
    const body = await res.text()
    if (options.prepareForWrite && body.trim() === "") {
      throw new WebdavFileNotFoundError()
    }
    return body
  }
  if (await isMissingWebdavBackupResponse(res))
    throw new WebdavFileNotFoundError()
  if (res.status === 401 || res.status === 403)
    throw new WebdavHttpError(t("messages:webdav.authFailed"), res.status)
  throw new WebdavHttpError(
    t("messages:webdav.downloadFailed", { status: res.status }),
    res.status,
  )
}

/**
 * Download the remote backup and return a plaintext JSON string.
 *
 * Backwards compatible:
 * - If the remote content is plain JSON (not an envelope), it is returned as-is.
 * - If the remote content is an encrypted envelope, this will attempt to decrypt
 *   using the stored encryption password and throw a localized error message on
 *   missing/incorrect passwords.
 */
export async function downloadBackup(
  custom?: Partial<WebDAVConfig>,
  options: WebdavBackupRequestOptions = {},
) {
  const raw = await downloadBackupRaw(custom, options)
  const envelope = tryParseEncryptedWebdavBackupEnvelope(raw)
  if (!envelope) return raw

  const encCfg = await getWebdavEncryptionConfig()
  if (!encCfg.password) {
    throw new Error(t("messages:webdav.decryptFailedNoPassword"))
  }

  try {
    return await decryptWebdavBackupEnvelope({
      envelope,
      password: encCfg.password,
    })
  } catch {
    throw new Error(t("messages:webdav.decryptFailed"))
  }
}

/**
 * Validates that the uploaded WebDAV payload can be read back as a backup.
 */
function validateWebdavUploadedBackupContent(
  content: string,
  expectedContent: string,
) {
  if (content !== expectedContent) {
    throw new Error(t("messages:webdav.uploadVerificationFailed"))
  }

  const envelope = tryParseEncryptedWebdavBackupEnvelope(content)
  if (envelope) {
    return
  }

  try {
    parseWebdavBackupJson(content)
  } catch {
    throw new Error(t("messages:webdav.uploadVerificationFailed"))
  }
}

/**
 * Upload a backup JSON string to the configured WebDAV location. When the
 * user provided only a directory-like URL, a versioned filename under
 * `all-api-hub-backup/` is generated automatically.
 *
 * When encryption is enabled, the plaintext JSON is uploaded as an encrypted
 * envelope JSON instead.
 */
export async function uploadBackup(
  content: string,
  custom?: Partial<WebDAVConfig>,
) {
  const context = await resolveWebdavBackupRequestContext(custom)
  const { cfg, targetUrl } = context

  const encCfg = await getWebdavEncryptionConfig()
  let contentToUpload = content
  if (encCfg.enabled) {
    if (!encCfg.password) {
      throw new Error(t("messages:webdav.encryptFailedNoPassword"))
    }
    const envelope = await encryptWebdavBackupContent({
      content,
      password: encCfg.password,
    })
    contentToUpload = JSON.stringify(envelope)
  }

  // Ensure backup directory exists when using folder-style input
  await prepareWebdavBackupTargetForWrite(context)
  void cleanupStaleTempBackupsBestEffort({
    collectionUrl: getBackupDirUrl(targetUrl),
    tempPrefixes: [
      createSafeCommitTempPrefix(targetUrl),
      createLegacySafeCommitTempPrefix(targetUrl),
    ],
    username: cfg.username,
    password: cfg.password,
  }).catch(() => {
    // Stale temp cleanup is maintenance only; uploads must not depend on it.
  })

  const tempUrl = createTempBackupUrl(targetUrl)
  let tempUploaded = false

  try {
    await putWebdavContent({
      url: tempUrl,
      username: cfg.username,
      password: cfg.password,
      content: contentToUpload,
    })
    tempUploaded = true

    const uploadedContent = await getWebdavContent({
      url: tempUrl,
      username: cfg.username,
      password: cfg.password,
      failureMessage: t("messages:webdav.uploadVerificationFailed"),
    })
    validateWebdavUploadedBackupContent(uploadedContent, contentToUpload)

    await moveWebdavContent({
      sourceUrl: tempUrl,
      destinationUrl: targetUrl,
      username: cfg.username,
      password: cfg.password,
    })

    return true
  } catch (error) {
    if (tempUploaded) {
      await deleteWebdavContentBestEffort({
        url: tempUrl,
        username: cfg.username,
        password: cfg.password,
      })
    }
    throw error
  }
}
