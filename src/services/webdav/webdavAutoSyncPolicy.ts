import { getCloudSyncProvider } from "~/services/webdav/cloudSyncService"
import {
  CLOUD_SYNC_PROVIDERS,
  type CloudSyncProvider,
  type WebDAVSettings,
} from "~/types/webdav"

/**
 * Convert the persisted WebDAV sync interval (seconds) to a safe alarms cadence (minutes).
 *
 * Notes:
 * - `browser.alarms` operates in minutes and generally requires >= 1 minute.
 * - The options UI constrains WebDAV interval to [60..86400] seconds in 60s steps, but we still clamp defensively.
 */
export function clampWebdavSyncIntervalMinutes(
  value: unknown,
  provider: CloudSyncProvider = CLOUD_SYNC_PROVIDERS.WEBDAV,
): number {
  const seconds = Number(value)
  const safeSeconds = Number.isFinite(seconds) ? seconds : 3600
  const minutes = Math.trunc(safeSeconds / 60)
  const minimumMinutes = provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST ? 5 : 1
  return Math.min(24 * 60, Math.max(minimumMinutes, minutes))
}

/** Check the active provider's minimum credentials for scheduled sync. */
export function isCloudSyncConfigured(settings: WebDAVSettings): boolean {
  if (getCloudSyncProvider(settings) === CLOUD_SYNC_PROVIDERS.GITHUB_GIST) {
    return Boolean(
      settings.githubGist?.token?.trim() &&
        settings.githubGist?.gistId?.trim() &&
        settings.backupEncryptionPassword?.trim(),
    )
  }

  return Boolean(
    settings.url?.trim() &&
      settings.username?.trim() &&
      settings.password?.trim(),
  )
}
