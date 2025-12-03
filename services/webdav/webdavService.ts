import { t } from "i18next"

import { userPreferences } from "~/services/userPreferences"
import type { WebDAVConfig } from "~/types/webdav"

function buildAuthHeader(username: string, password: string) {
  const token = btoa(`${username}:${password}`)
  return `Basic ${token}`
}

const CONFIG_VERSION = "1-0"
export const PROGRAM_NAME = "all-api-hub"
const BACKUP_FOLDER_NAME = `${PROGRAM_NAME}-backup`

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

async function getWebDavConfig(): Promise<WebDAVConfig> {
  const prefs = await userPreferences.getPreferences()
  return prefs.webdav
}

/**
 * Test connectivity and authentication against the configured WebDAV
 * endpoint. Treats 200 and 404 as success (404 means the backup file does
 * not yet exist but auth is valid).
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
  // 200 存在；404 文件不存在但鉴权通过也视为连通
  if (res.status === 200 || res.status === 404) return true
  if (res.status === 401 || res.status === 403)
    throw new Error(t("messages:webdav.authFailed"))
  throw new Error(t("messages:webdav.connectionFailed", { status: res.status }))
}

/**
 * Download the current backup JSON from the configured WebDAV location.
 * Returns the raw response body as text, or throws a localized error when
 * the file is missing, auth fails or the request fails.
 */
export async function downloadBackup(custom?: Partial<WebDAVConfig>) {
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
 * Upload a backup JSON string to the configured WebDAV location. When the
 * user provided only a directory-like URL, a versioned filename under
 * `all-api-hub-backup/` is generated automatically.
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

  // Ensure backup directory exists when using folder-style input
  await ensureBackupDirectory(targetUrl, cfg.username, cfg.password)

  const res = await fetch(targetUrl, {
    method: "PUT",
    headers: {
      Authorization: buildAuthHeader(cfg.username, cfg.password),
      "Content-Type": "application/json",
    },
    body: content,
  })

  if (res.status >= 200 && res.status < 300) return true
  if (res.status === 401 || res.status === 403)
    throw new Error(t("messages:webdav.authFailed"))
  throw new Error(t("messages:webdav.uploadFailed", { status: res.status }))
}
