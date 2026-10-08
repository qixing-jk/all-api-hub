/** Stable alarm identities shared by periodic sync and deletion-triggered uploads. */
export const WEBDAV_AUTO_SYNC_ALARMS = {
  Periodic: "webdavAutoSync",
  BestEffortUpload: "webdavAutoSyncBestEffortUpload",
} as const
export const BEST_EFFORT_UPLOAD_DELAY_MINUTES = 1
