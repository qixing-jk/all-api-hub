import { useTranslation } from "react-i18next"

import { BodySmall, Checkbox, Label } from "~/components/ui"
import {
  CLOUD_SYNC_PROVIDERS,
  isWebdavSyncDataSelectionEmpty,
} from "~/types/webdav"

import type { WebdavConfigState } from "../hooks/useWebdavConfig"
import { WEBDAV_TARGET_IDS } from "../searchTargets"

/** Keep the backup selection inside the configuration that saves it. */
export function WebdavSyncDataSettings({
  config,
}: {
  config: WebdavConfigState
}) {
  const { t } = useTranslation("importExport")
  const {
    provider,
    syncDataSelection,
    syncDataOptions,
    updateSyncDataSelection,
  } = config
  return (
    <div
      id={WEBDAV_TARGET_IDS.syncData}
      className="space-y-3 rounded-md bg-gray-50 p-3 dark:bg-gray-800"
    >
      <div className="space-y-1">
        <p className="text-sm font-medium">{t("webdav.syncData.title")}</p>
        <BodySmall id={WEBDAV_TARGET_IDS.restorePolicy} className="m-0">
          {t(
            provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST
              ? "webdav.gist.restorePolicyDescription"
              : "webdav.restorePolicy.description",
          )}
        </BodySmall>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {syncDataOptions.map((option) => (
          <div key={option.key} className="flex items-center gap-2">
            <Checkbox
              id={option.id}
              checked={syncDataSelection[option.key]}
              onCheckedChange={(checked) =>
                updateSyncDataSelection(option.key, checked)
              }
            />
            <Label htmlFor={option.id}>{option.label}</Label>
          </div>
        ))}
      </div>

      {isWebdavSyncDataSelectionEmpty(syncDataSelection) && (
        <BodySmall className="mb-0 text-red-600 dark:text-red-400">
          {t("webdav.syncData.selectionRequired")}
        </BodySmall>
      )}
    </div>
  )
}
