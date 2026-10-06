import type { PreferenceSaveOptions } from "~/contexts/UserPreferencesContext"
import { createPreferenceDraftReset } from "~/features/BasicSettings/components/shared/createPreferenceDraftReset"
import { usePreferenceDraft } from "~/hooks/usePreferenceDraft"
import type { PreferenceWriteResult } from "~/services/preferences/userPreferences"
import { runPreferenceUpdateWithToast } from "~/utils/feedback/preferenceFeedback"

import {
  MANAGED_SITE_CONFIG_TEXT_POLICIES,
  type ManagedSiteConfigTextPolicy,
} from "./managedSiteConfigFields"

type ConfigFields<Config> = {
  [Field in keyof Config]: {
    setting: string
    policy?: ManagedSiteConfigTextPolicy
    update(
      value: string,
      options: PreferenceSaveOptions,
    ): Promise<PreferenceWriteResult>
  }
}

/** Owns configuration draft, guarded field writes and successful reset reconciliation. */
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
  fields: ConfigFields<Config>
}) {
  const draft = usePreferenceDraft({ savedValue: savedConfig, savedVersion })
  const commitField = async (field: keyof Config, value: string) => {
    const definition = fields[field]
    const policy: ManagedSiteConfigTextPolicy =
      definition.policy ?? MANAGED_SITE_CONFIG_TEXT_POLICIES.Raw
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
    return runPreferenceUpdateWithToast({
      expectedLastUpdated: draft.expectedLastUpdated,
      setting: definition.setting,
      update: (options) => definition.update(parsed, options),
    })
  }
  return {
    ...draft,
    commitField,
    resetProps: createPreferenceDraftReset({
      draft: draft.draft,
      storedValue: storedConfig,
      savedValue: savedConfig,
      defaults,
      reset,
      setDraft: draft.setDraft,
    }),
  }
}
