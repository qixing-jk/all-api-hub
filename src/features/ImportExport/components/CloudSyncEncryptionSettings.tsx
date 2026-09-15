import { useTranslation } from "react-i18next"

import {
  Badge,
  BodySmall,
  FormField,
  Heading4,
  Input,
  Switch,
} from "~/components/ui"
import { CLOUD_SYNC_PROVIDERS } from "~/types/webdav"

import type { WebdavConfigState } from "../hooks/useWebdavConfig"
import { WEBDAV_TARGET_IDS } from "../searchTargets"
import { FieldHelpPopover } from "./FieldHelpPopover"

/** Present the shared backup password with the active provider's encryption policy. */
export function CloudSyncEncryptionSettings({
  config,
}: {
  config: WebdavConfigState
}) {
  const { t } = useTranslation("importExport")
  const {
    provider,
    backupEncryptionEnabled,
    backupEncryptionPassword,
    gistEncryptionPasswordError,
    setGistEncryptionPasswordError,
    setLocalConfig,
    saveConnectionField,
    setEncryptionEnabled,
  } = config
  const isGist = provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST

  return (
    <div
      id={WEBDAV_TARGET_IDS.encryption}
      className="bg-surface-subtle dark:bg-card space-y-density-3 py-density-3 rounded-md px-3"
    >
      <div className="gap-y-density-3 flex items-start justify-between gap-x-3">
        <div className="space-y-density-1 min-w-0">
          <Heading4 className="m-0 text-sm">
            {t("webdav.encryption.title")}
          </Heading4>
          <BodySmall className="m-0">
            {t(
              isGist
                ? "webdav.gist.encryptionDescription"
                : "webdav.encryption.enableDesc",
            )}
          </BodySmall>
        </div>
        {isGist ? (
          <Badge variant="outline" className="shrink-0">
            {t("webdav.encryption.alwaysEncrypted")}
          </Badge>
        ) : (
          <Switch
            id={WEBDAV_TARGET_IDS.encryptionEnable}
            aria-label={t("webdav.encryption.title")}
            checked={backupEncryptionEnabled}
            onChange={setEncryptionEnabled}
          />
        )}
      </div>
      <FormField
        label={
          <span className="gap-y-density-1 inline-flex items-center gap-x-1">
            {t("webdav.encryption.password")}
            <FieldHelpPopover
              label={t("webdav.encryption.password")}
              content={t("webdav.encryption.passwordDesc")}
            />
          </span>
        }
        htmlFor={WEBDAV_TARGET_IDS.encryptionPassword}
        required={isGist}
        error={isGist ? gistEncryptionPasswordError : undefined}
      >
        <Input
          id={WEBDAV_TARGET_IDS.encryptionPassword}
          title={t("webdav.encryption.password")}
          type="password"
          revealable
          revealLabels={{
            show: t("webdav.showPassword"),
            hide: t("webdav.hidePassword"),
          }}
          placeholder={t("webdav.encryption.passwordPlaceholder")}
          value={backupEncryptionPassword}
          onBlur={(event) =>
            saveConnectionField(
              "backupEncryptionPassword",
              event.currentTarget.value,
            )
          }
          aria-invalid={isGist && Boolean(gistEncryptionPasswordError)}
          aria-describedby="cloud-sync-shared-password-description"
          onChange={(event) => {
            setGistEncryptionPasswordError(undefined)
            setLocalConfig((prev) => ({
              ...prev,
              backupEncryptionPassword: event.target.value,
            }))
          }}
        />
      </FormField>
      <p
        id="cloud-sync-shared-password-description"
        className="text-muted-foreground text-xs"
      >
        {t("webdav.encryption.sharedPasswordDescription")}
      </p>
    </div>
  )
}
