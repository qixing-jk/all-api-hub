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
      className="bg-surface-subtle dark:bg-card space-y-density-3 py-density-3 rounded-md px-3"
    >
      <div className="space-y-density-1">
        <p className="text-sm font-medium">{t("webdav.syncData.title")}</p>
        <BodySmall id={WEBDAV_TARGET_IDS.restorePolicy} className="m-0">
          {t(
            provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST
              ? "webdav.gist.restorePolicyDescription"
              : "webdav.restorePolicy.description",
          )}
        </BodySmall>
      </div>

      <div className="gap-y-density-2 grid grid-cols-1 gap-x-2 sm:grid-cols-2">
        {syncDataOptions.map((option) => (
          <div
            key={option.key}
            className="gap-y-density-2 flex items-center gap-x-2"
          >
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
        <BodySmall className="text-destructive-text mb-0">
          {t("webdav.syncData.selectionRequired")}
        </BodySmall>
      )}
    </div>
  )
}
