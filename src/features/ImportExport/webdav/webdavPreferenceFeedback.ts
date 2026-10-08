import type { TFunction } from "i18next"

import { PersistWebdavConfigError } from "~/features/ImportExport/webdav/webDavAnalytics"
import { getPreferenceWriteFailureMessage } from "~/utils/feedback/preferenceFeedback"

/** Resolve guarded preference-write feedback consistently across sync actions. */
export const getPersistWebdavConfigErrorMessage = (
  error: unknown,
  t: TFunction,
) => {
  if (error instanceof PersistWebdavConfigError && error.preferenceFailure) {
    return getPreferenceWriteFailureMessage(error.preferenceFailure, {
      fallback: t("settings:messages.saveSettingsFailed"),
    })
  }

  return t("settings:messages.saveSettingsFailed")
}
