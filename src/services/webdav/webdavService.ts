import { userPreferences } from "~/services/preferences/userPreferences"
import type { WebDAVConfig } from "~/types/webdav"
import { t } from "~/utils/i18n/core"

import {
  decryptWebdavBackupEnvelope,
  encryptWebdavBackupContent,
  tryParseEncryptedWebdavBackupEnvelope,
} from "./webdavBackupEncryption"
import {
  BACKUP_FOLDER_NAME,
  buildAuthHeader,
  commitWebdavBackup,
  CONFIG_VERSION,
  ensureBackupDirectory,
  PROGRAM_NAME,
  WebdavHttpError,
} from "./webdavBackupTransport"

/**
 * Jianguoyun/Nutstore returns this DAV exception inside a 409 XML payload when
 * a requested file's parent collection has not been created yet.
 */
const WEBDAV_ANCESTORS_NOT_FOUND_MARKER = "AncestorsNotFound"

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

  return await commitWebdavBackup({
    targetUrl,
    username: cfg.username,
    password: cfg.password,
    content: contentToUpload,
  })
}
