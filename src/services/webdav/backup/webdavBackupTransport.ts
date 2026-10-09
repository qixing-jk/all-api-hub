import { tryParseEncryptedWebdavBackupEnvelope } from "~/services/webdav/backup/webdavBackupEncryption"
import { parseWebdavBackupJson } from "~/services/webdav/backup/webdavBackupValidation"
import { t } from "~/utils/i18n/core"

/**
 * WebDAV backup path version string.
 *
 * This controls the default filename under the configured WebDAV directory.
 * It is intentionally separate from the backup schema version.
 */
export const CONFIG_VERSION = "1-0"

/**
 * Builds a Basic Authorization header value from WebDAV username and password.
 */
export function buildAuthHeader(username: string, password: string) {
  const token = btoa(`${username}:${password}`)
  return `Basic ${token}`
}

/**
 * OpenCloud can return 425 while asynchronous upload post-processing is still
 * running and expects clients to retry later:
 * https://github.com/opencloud-eu/opencloud/blob/main/tests/acceptance/TestHelpers/HttpRequestHelper.php#L49-L62
 */
const WEBDAV_TOO_EARLY_STATUS = 425
const UPLOAD_READBACK_MAX_ATTEMPTS = 10
const UPLOAD_READBACK_RETRY_DELAY_MS = 1000
const UPLOAD_READBACK_TIMEOUT_MS = 10_000
const TEMP_CLEANUP_TIMEOUT_MS = 5_000

/**
 * Program identifier used in default WebDAV backup paths.
 */
export const PROGRAM_NAME = "all-api-hub"

export class WebdavHttpError extends Error {
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
 * Default WebDAV collection/directory name used for backups.
 */
export const BACKUP_FOLDER_NAME = `${PROGRAM_NAME}-backup`
const STALE_TEMP_MAX_AGE_MS = 24 * 60 * 60 * 1000

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
  const queryIndex = targetUrl.search(/[?#]/)
  const cleanUrl = queryIndex < 0 ? targetUrl : targetUrl.slice(0, queryIndex)
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
export async function ensureBackupDirectory(
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

  await requireWebdavMutationSuccess(
    res,
    t("messages:webdav.uploadFailed", { status: res.status }),
  )
}

/**
 * Keep Multi-Status outcomes uncertain until readback proves the mutation.
 * Only extract terminal DAV status fields; XML success is never proof of a
 * committed file. This also works in service workers without DOMParser.
 */
async function requireWebdavMutationSuccess(
  res: Response,
  failureMessage: string,
) {
  let status = res.status
  if (status === 207) {
    try {
      const body = (await res.text()).replace(/<!--[\s\S]*?-->/g, "")
      const statuses = Array.from(
        body.matchAll(
          /<(?:[\w.-]+:)?status\b[^>]*>\s*HTTP\/[\d.]+\s+(\d{3})\b[^<]*<\/(?:[\w.-]+:)?status\s*>/g,
        ),
        (match) => Number(match[1]),
      )
      status =
        statuses.find((code) => code === 401 || code === 403) ??
        (statuses.includes(412) ? 412 : 207)
    } catch {
      // An unreadable Multi-Status body still requires authoritative readback.
    }
  } else if (status >= 200 && status < 300) {
    return
  }

  throw new WebdavHttpError(
    status === 401 || status === 403
      ? t("messages:webdav.authFailed")
      : failureMessage,
    status,
  )
}

/** Responses that may have lost or obscured a successful remote mutation. */
function isAmbiguousWebdavMutationError(error: unknown) {
  return (
    !(error instanceof WebdavHttpError) ||
    error.statusCode === 207 ||
    error.statusCode === 404 ||
    error.statusCode === 409 ||
    error.statusCode >= 500
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
    cache: "no-store",
    signal: AbortSignal.timeout(UPLOAD_READBACK_TIMEOUT_MS),
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
 * Reads a newly uploaded backup after provider post-processing.
 */
async function getUploadedWebdavContent(params: {
  url: string
  username: string
  password: string
}) {
  for (let attempt = 1; attempt <= UPLOAD_READBACK_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await getWebdavContent({
        ...params,
        failureMessage: t("messages:webdav.uploadVerificationFailed"),
      })
    } catch (error) {
      const isStillProcessing =
        error instanceof WebdavHttpError &&
        error.statusCode === WEBDAV_TOO_EARLY_STATUS
      if (!isStillProcessing) {
        throw error
      }

      if (attempt === UPLOAD_READBACK_MAX_ATTEMPTS) {
        throw new WebdavHttpError(
          t("messages:webdav.uploadStillProcessing"),
          WEBDAV_TOO_EARLY_STATUS,
        )
      }

      await new Promise((resolve) =>
        setTimeout(resolve, UPLOAD_READBACK_RETRY_DELAY_MS),
      )
    }
  }

  throw new Error(t("messages:webdav.uploadVerificationFailed"))
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
  const res = await fetch(params.sourceUrl, {
    method: "MOVE",
    headers: {
      Authorization: buildAuthHeader(params.username, params.password),
      Destination: encodeWebdavHeaderUrl(params.destinationUrl),
      Overwrite: "T",
    },
  })
  await requireWebdavMutationSuccess(res, t("messages:webdav.safeCommitFailed"))
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
  try {
    const res = await fetch(params.destinationUrl, {
      method: "DELETE",
      headers: {
        Authorization: buildAuthHeader(params.username, params.password),
      },
    })
    if (res.status === 404) return
    await requireWebdavMutationSuccess(
      res,
      t("messages:webdav.safeCommitFailed"),
    )
  } catch (error) {
    if (isAmbiguousWebdavMutationError(error)) {
      try {
        await getWebdavContent({
          url: params.destinationUrl,
          username: params.username,
          password: params.password,
        })
      } catch (readError) {
        if (
          readError instanceof WebdavHttpError &&
          readError.statusCode === 404
        )
          return
      }
    }
    throw error
  }
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
      signal: AbortSignal.timeout(TEMP_CLEANUP_TIMEOUT_MS),
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
function parseWebdavHrefValues(xml: string): string[] {
  return Array.from(xml.matchAll(/<[^>]*href[^>]*>([^<]+)<\/[^>]*href>/gi))
    .map((match) => match[1])
    .filter((href): href is string => href !== undefined)
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
  if (!raw) {
    return null
  }
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

type WebdavBackupContent = {
  url: string
  username: string
  password: string
  content: string
}

/** Verify the exact serialized payload, including an encrypted envelope when used. */
async function verifyWebdavBackupContent(params: WebdavBackupContent) {
  const uploadedContent = await getUploadedWebdavContent(params)
  validateWebdavUploadedBackupContent(uploadedContent, params.content)
}

/** Distinguish a mismatched/missing backup from a failed reconciliation read. */
async function readWebdavCommitState(params: WebdavBackupContent) {
  try {
    const actualContent = await getUploadedWebdavContent(params)
    return actualContent === params.content ? "committed" : "uncommitted"
  } catch (error) {
    return error instanceof WebdavHttpError && error.statusCode === 404
      ? "uncommitted"
      : "unknown"
  }
}

/** Use direct PUT only after MOVE explicitly reports an unsupported method. */
async function putVerifiedWebdavBackup(params: WebdavBackupContent) {
  try {
    await putWebdavContent(params)
  } catch (error) {
    if (
      isAmbiguousWebdavMutationError(error) &&
      (await readWebdavCommitState(params)) === "committed"
    )
      return
    throw error
  }
  await verifyWebdavBackupContent(params)
}

/**
 * Commit a verified temp file, returning whether that temp file may remain.
 * Readback precedes an overwrite retry so a lost response cannot delete an
 * already committed backup. Verification failures never trigger another write.
 */
async function commitVerifiedWebdavBackup(
  params: WebdavBackupContent & { tempUrl: string },
  allowOverwriteRetry = true,
): Promise<boolean> {
  try {
    await moveWebdavContent({
      sourceUrl: params.tempUrl,
      destinationUrl: params.url,
      username: params.username,
      password: params.password,
    })
  } catch (error) {
    if (
      error instanceof WebdavHttpError &&
      (error.statusCode === 405 || error.statusCode === 501)
    ) {
      await putVerifiedWebdavBackup(params)
      return true
    }

    const commitState = isAmbiguousWebdavMutationError(error)
      ? await readWebdavCommitState(params)
      : "unknown"
    if (commitState === "committed") return true

    if (error instanceof WebdavHttpError && commitState === "uncommitted") {
      if (
        allowOverwriteRetry &&
        shouldRetryMoveAfterDeletingDestination(error.statusCode)
      ) {
        // Preserve the established Nutstore (409) / cstcloud (500) workaround.
        await deleteWebdavDestinationBeforeMoveRetry({
          destinationUrl: params.url,
          username: params.username,
          password: params.password,
        })
        return commitVerifiedWebdavBackup(params, false)
      }
    }
    throw error
  }

  await verifyWebdavBackupContent(params)
  return false
}

/** Uploads through a temporary file, verifies readback, then commits or cleans up. */
export async function commitWebdavBackup(params: {
  targetUrl: string
  username: string
  password: string
  content: string
}) {
  const { targetUrl, username, password, content } = params
  // Ensure backup directory exists when using folder-style input
  await ensureBackupDirectory(targetUrl, username, password)
  void cleanupStaleTempBackupsBestEffort({
    collectionUrl: getBackupDirUrl(targetUrl),
    tempPrefixes: [
      createSafeCommitTempPrefix(targetUrl),
      createLegacySafeCommitTempPrefix(targetUrl),
    ],
    username,
    password,
  }).catch(() => {
    // Stale temp cleanup is maintenance only; uploads must not depend on it.
  })

  const tempUrl = createTempBackupUrl(targetUrl)
  let tempUploaded = false
  let tempVerified = false

  try {
    await putWebdavContent({
      url: tempUrl,
      username,
      password,
      content,
    })
    tempUploaded = true

    await verifyWebdavBackupContent({
      url: tempUrl,
      username,
      password,
      content,
    })
    tempVerified = true

    const tempMayRemain = await commitVerifiedWebdavBackup({
      url: targetUrl,
      tempUrl,
      username,
      password,
      content,
    })
    if (tempMayRemain) {
      void deleteWebdavContentBestEffort({ url: tempUrl, username, password })
    }

    return true
  } catch (error) {
    // Retain a verified recovery copy when the final commit is uncertain or
    // failed, especially if the overwrite workaround already removed the old file.
    if (tempUploaded && !tempVerified) {
      await deleteWebdavContentBestEffort({
        url: tempUrl,
        username,
        password,
      })
    }
    throw error
  }
}
