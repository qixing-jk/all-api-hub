import { useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { createPreferenceDraftReset } from "~/features/BasicSettings/components/shared/createPreferenceDraftReset"
import {
  getManagedSiteFieldPolicy,
  saveManagedSiteConfig,
  type ManagedSiteConfigFields,
  type PendingManagedSiteFieldWrite,
} from "~/features/BasicSettings/components/tabs/ManagedSite/configuration/saveManagedSiteConfig"
import { usePreferenceDraft } from "~/hooks/preferences/usePreferenceDraft"
import toast from "~/lib/notify"
import {
  PREFERENCE_WRITE_FAILURE_TYPES,
  type PreferenceWriteFailure,
  type PreferenceWriteResult,
} from "~/services/preferences/preferencesStore"
import {
  getPreferenceWriteFailureMessage,
  runPreferenceUpdateWithToast,
} from "~/utils/feedback/preferenceFeedback"

export const MANAGED_SITE_CONNECTION_STATES = {
  Idle: "idle",
  Saving: "saving",
  Checking: "checking",
} as const

type ManagedSiteConnectionState =
  (typeof MANAGED_SITE_CONNECTION_STATES)[keyof typeof MANAGED_SITE_CONNECTION_STATES]
/** A void result delegates feedback to the existing interactive verification flow. */
type ConnectionValidationResult = { success: boolean; message?: string } | void

/** Owns drafts, guarded saves, reset reconciliation and save-before-check feedback. */
export function useManagedSiteConfigDraft<
  Config extends Record<string, string>,
>({
  savedConfig,
  savedVersion,
  storedConfig,
  defaults,
  reset,
  fields,
}: {
  savedConfig: Config
  savedVersion: number
  storedConfig: unknown
  defaults: Partial<Config> | undefined
  reset(): Promise<PreferenceWriteResult>
  fields: ManagedSiteConfigFields<Config>
}) {
  const draft = usePreferenceDraft({ savedValue: savedConfig, savedVersion })
  const { t } = useTranslation()
  const notificationId = useId()
  const latestSavedConfig = useRef(savedConfig)
  latestSavedConfig.current = savedConfig
  const fieldWrites = useRef(
    new Map<keyof Config, PendingManagedSiteFieldWrite>(),
  )
  const checkInProgress = useRef(false)
  const [connectionCheckState, setConnectionCheckState] =
    useState<ManagedSiteConnectionState>(MANAGED_SITE_CONNECTION_STATES.Idle)
  const commitField = async (field: keyof Config, value: string) => {
    if (checkInProgress.current) return undefined
    const definition = fields[field]
    const policy = getManagedSiteFieldPolicy(definition)
    const parsed = policy.parse(value)
    if (parsed === undefined) return undefined
    if (policy.reconcileDraft) {
      draft.setDraft((current) => ({ ...current, [field]: parsed }))
    }
    const savedValue = savedConfig[field]
    const saved =
      savedValue === undefined
        ? undefined
        : policy.compareSaved?.(savedValue) ?? savedValue
    if (parsed === saved) return undefined
    const write = runPreferenceUpdateWithToast({
      expectedLastUpdated: draft.expectedLastUpdated,
      setting: definition.setting,
      update: (options) => definition.update(parsed, options),
    })
    fieldWrites.current.set(field, { value: parsed, write })
    return write
  }
  const showSaveFailure = (reason: PreferenceWriteFailure) => {
    if (reason.type === PREFERENCE_WRITE_FAILURE_TYPES.Stale) {
      toast.warning(t("settings:managedSiteConnection.conflict"), {
        id: notificationId,
        action: {
          label: t("settings:managedSiteConnection.reload"),
          onClick: () => draft.setDraft(latestSavedConfig.current),
        },
      })
    } else {
      toast.error(
        t("settings:managedSiteConnection.saveFailed", {
          reason: getPreferenceWriteFailureMessage(reason),
        }),
        { id: notificationId },
      )
    }
  }
  const checkConnection = async (
    config: Config,
    validate: (
      saved: Config,
    ) => Promise<ConnectionValidationResult> | ConnectionValidationResult,
  ) => {
    if (checkInProgress.current) return
    checkInProgress.current = true
    setConnectionCheckState(MANAGED_SITE_CONNECTION_STATES.Saving)
    toast.loading(t("settings:managedSiteConnection.saving"), {
      id: notificationId,
    })
    let configurationSaved = false
    try {
      const writes = new Map(fieldWrites.current)
      fieldWrites.current.clear()
      const result = await saveManagedSiteConfig({
        config,
        savedConfig,
        expectedLastUpdated: draft.expectedLastUpdated,
        fields,
        writes,
      })
      if (!result.ok) {
        if ("reason" in result) showSaveFailure(result.reason)
        else
          toast.error(
            t("settings:managedSiteConnection.invalidField", {
              field: result.invalidField,
            }),
            { id: notificationId },
          )
        return
      }
      const normalized = result.config
      draft.setDraft(normalized)
      configurationSaved = true
      setConnectionCheckState(MANAGED_SITE_CONNECTION_STATES.Checking)
      toast.loading(t("settings:managedSiteConnection.checking"), {
        id: notificationId,
      })
      const validation = await validate(normalized)
      if (!validation) {
        toast.dismiss(notificationId)
        return
      }
      if (validation.success) {
        toast.success(t("settings:managedSiteConnection.success"), {
          id: notificationId,
        })
      } else {
        toast.error(
          t("settings:managedSiteConnection.failed", {
            reason:
              validation.message ??
              t("settings:managedSiteConnection.unreachable"),
          }),
          { id: notificationId },
        )
      }
    } catch {
      toast.error(
        configurationSaved
          ? t("settings:managedSiteConnection.checkError")
          : t("settings:managedSiteConnection.saveError"),
        { id: notificationId },
      )
    } finally {
      checkInProgress.current = false
      setConnectionCheckState(MANAGED_SITE_CONNECTION_STATES.Idle)
    }
  }
  const isValidating =
    connectionCheckState !== MANAGED_SITE_CONNECTION_STATES.Idle
  const resetProps = createPreferenceDraftReset({
    draft: draft.draft,
    storedValue: storedConfig,
    savedValue: savedConfig,
    defaults,
    reset: async () => {
      const result = await reset()
      if (result.ok) fieldWrites.current.clear()
      return result
    },
    setDraft: draft.setDraft,
  })
  return {
    ...draft,
    commitField,
    checkConnection,
    connectionCheckState,
    isValidating,
    connectionCheckLabel:
      connectionCheckState === MANAGED_SITE_CONNECTION_STATES.Saving
        ? t("settings:managedSiteConnection.saving")
        : connectionCheckState === MANAGED_SITE_CONNECTION_STATES.Checking
          ? t("settings:managedSiteConnection.checking")
          : t("settings:managedSiteConnection.check"),
    resetProps: {
      ...resetProps,
      resetDisabled: resetProps.resetDisabled || isValidating,
    },
  }
}
