import type { PreferenceSaveOptions } from "~/contexts/userPreferences/preferenceContextTypes"
import {
  MANAGED_SITE_CONFIG_TEXT_POLICIES,
  type ManagedSiteConfigTextPolicy,
} from "~/features/BasicSettings/components/tabs/ManagedSite/configuration/managedSiteConfigFields"
import type {
  PreferenceWriteFailure,
  PreferenceWriteResult,
} from "~/services/preferences/preferencesStore"

export type ManagedSiteConfigFields<Config> = {
  [Field in keyof Config]: {
    setting: string
    policy?: ManagedSiteConfigTextPolicy
    update(
      value: string,
      options: PreferenceSaveOptions,
    ): Promise<PreferenceWriteResult>
  }
}

export type PendingManagedSiteFieldWrite = {
  value: string
  write: Promise<PreferenceWriteResult>
}

type ConfigSaveResult<Config> =
  | { ok: true; config: Config }
  | { ok: false; reason: PreferenceWriteFailure }
  | { ok: false; invalidField: string }

/** Field text semantics are shared by blur saves and explicit connection checks. */
export const getManagedSiteFieldPolicy = (field: {
  policy?: ManagedSiteConfigTextPolicy
}): ManagedSiteConfigTextPolicy =>
  field.policy ?? MANAGED_SITE_CONFIG_TEXT_POLICIES.Raw

/** Joins existing writes and persists the normalized draft using the store's guarded updates. */
export async function saveManagedSiteConfig<
  Config extends Record<string, string>,
>({
  config,
  savedConfig,
  expectedLastUpdated,
  fields,
  writes,
}: {
  config: Config
  savedConfig: Config
  expectedLastUpdated: number
  fields: ManagedSiteConfigFields<Config>
  writes: ReadonlyMap<keyof Config, PendingManagedSiteFieldWrite>
}): Promise<ConfigSaveResult<Config>> {
  const results = await Promise.all(
    [...writes.entries()].map(async ([field, pending]) => ({
      field,
      value: pending.value,
      result: await pending.write,
    })),
  )
  let version = expectedLastUpdated
  const persisted = { ...savedConfig }
  for (const { field, value, result } of results) {
    if (!result.ok) {
      return { ok: false, reason: result.reason }
    }
    if (result.preferences.lastUpdated >= expectedLastUpdated) {
      persisted[field] = value as Config[keyof Config]
      version = Math.max(version, result.preferences.lastUpdated)
    }
  }
  const normalized = { ...config }
  for (const field of Object.keys(fields) as (keyof Config)[]) {
    const policy = getManagedSiteFieldPolicy(fields[field])
    const value = policy.parse(config[field] ?? "")
    if (value === undefined) {
      if (config[field] === persisted[field]) continue
      return { ok: false, invalidField: fields[field].setting }
    }
    normalized[field] = value as Config[keyof Config]
    if (value === persisted[field]) continue
    const result = await fields[field].update(value, {
      expectedLastUpdated: version,
    })
    if (!result.ok) {
      return { ok: false, reason: result.reason }
    }
    version = result.preferences.lastUpdated
  }
  return { ok: true, config: normalized }
}
