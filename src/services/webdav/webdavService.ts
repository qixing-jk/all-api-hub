import { t } from "i18next"

import { userPreferences } from "~/services/preferences/userPreferences"
import type { WebDAVConfig } from "~/types/webdav"

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
 * Program identifier used in default WebDAV backup paths.
 */
export const PROGRAM_NAME = "all-api-hub"

/**
 * Default WebDAV collection/directory name used for backups.
 */
const BACKUP_FOLDER_NAME = `${PROGRAM_NAME}-backup`

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
 * Any non-auth HTTP status in the 2xx–4xx range is treated as a successful
 * connectivity check (the exact backup file does not need to exist yet).
 * 401/403 are treated as authentication failures and 5xx as connection
 * errors.
 */
export async function testWebdavConnection(custom?: Partial<WebDAVConfig>) {
  const cfg = { ...(await getWebDavConfig()), ...custom }
  if (!cfg.url || !cfg.username || !cfg.password) {
    throw new Error(t("messages:webdav.configIncomplete"))
  }
  const targetUrl = ensureFilename(cfg.url)

  const res = await fetch(targetUrl, {
    method: "GET",
    headers: {
      Authorization: buildAuthHeader(cfg.username, cfg.password),
    },
  })
  // 401/403 明确表示鉴权失败
  if (res.status === 401 || res.status === 403)
    throw new Error(t("messages:webdav.authFailed"))
  // 其余 2xx–4xx（例如部分 WebDAV 服务返回的 405/409 等）视为网络可达且凭据大概率有效
  if (res.status >= 200 && res.status < 500) return true
  // 5xx 等错误仍视为连接失败，保留原有错误信息
  throw new Error(t("messages:webdav.connectionFailed", { status: res.status }))
}

/**
 * Download the remote backup as raw text.
 *
 * This function does not attempt to detect or decrypt encrypted envelopes.
 * It is intended for UI flows that need to decide how to prompt the user when
 * no password is available or decryption fails.
 */
export async function downloadBackupRaw(custom?: Partial<WebDAVConfig>) {
  const cfg = { ...(await getWebDavConfig()), ...custom }
  if (!cfg.url || !cfg.username || !cfg.password) {
    throw new Error(t("messages:webdav.configIncomplete"))
  }
  const targetUrl = ensureFilename(cfg.url)

  const res = await fetch(targetUrl, {
    method: "GET",
    headers: {
      Authorization: buildAuthHeader(cfg.username, cfg.password),
      Accept: "application/json",
    },
  })
  if (res.status === 200) {
    return await res.text()
  }
  if (res.status === 404) throw new Error(t("messages:webdav.fileNotFound"))
  if (res.status === 401 || res.status === 403)
    throw new Error(t("messages:webdav.authFailed"))
  throw new Error(t("messages:webdav.downloadFailed", { status: res.status }))
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
export async function downloadBackup(custom?: Partial<WebDAVConfig>) {
  const raw = await downloadBackupRaw(custom)
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
  const cfg = { ...(await getWebDavConfig()), ...custom }
  if (!cfg.url || !cfg.username || !cfg.password) {
    throw new Error(t("messages:webdav.configIncomplete"))
  }
  const targetUrl = ensureFilename(cfg.url)

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
  await ensureBackupDirectory(targetUrl, cfg.username, cfg.password)

  const res = await fetch(targetUrl, {
    method: "PUT",
    headers: {
      Authorization: buildAuthHeader(cfg.username, cfg.password),
      "Content-Type": "application/json",
    },
    body: contentToUpload,
  })

  if (res.status >= 200 && res.status < 300) return true
  if (res.status === 401 || res.status === 403)
    throw new Error(t("messages:webdav.authFailed"))
  throw new Error(t("messages:webdav.uploadFailed", { status: res.status }))
}
