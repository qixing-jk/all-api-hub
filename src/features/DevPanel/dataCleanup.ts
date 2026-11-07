import {
  ACCOUNT_DIALOG_RECOVERY_STORAGE_KEYS,
  ACCOUNT_KEY_AUTO_PROVISIONING_STORAGE_KEYS,
  AIMLAPI_ONBOARDING_STORAGE_KEY,
  AUTO_CHECKIN_STORAGE_KEYS,
  I18NEXT_LANGUAGE_STORAGE_KEY,
  SITE_TYPE_OBSERVATION_STORAGE_KEYS,
  SPONSOR_WORKFLOW_STORAGE_KEYS,
  STORAGE_KEYS,
  STORAGE_LOCKS,
} from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import { USAGE_HISTORY_STORAGE_KEYS } from "~/services/history/usageHistory/constants"
import { clearLogHistory } from "~/services/logging/logHistory"
import { clearAllAlarms } from "~/utils/browser/alarms"
import {
  clearSessionStorage,
  clearSyncStorage,
  getLocalStorageValues,
  removeLocalStorage,
  removeSessionStorageValues,
} from "~/utils/browser/storage"
import { isDevelopmentMode } from "~/utils/core/environment"
import { THEME_BOOTSTRAP_CACHE_KEY } from "~/utils/ui/themePreferences"

import { clearDevFixtureAccounts } from "./fixtureAccounts"
import { clearDevFixtureApiCredentials } from "./fixtureApiCredentials"

const cleanupScopes = [
  "fixtures",
  "accounts",
  "history",
  "caches",
  "settings",
  "all",
] as const
export type DevDataCleanupScope = (typeof cleanupScopes)[number]

type LocalStore = {
  lock: string
  keys: readonly string[]
  prefixes?: readonly string[]
  scopes?: readonly DevDataCleanupScope[]
}

const localStores: readonly LocalStore[] = [
  {
    lock: STORAGE_LOCKS.USER_PREFERENCES,
    keys: [STORAGE_KEYS.USER_PREFERENCES],
    scopes: ["settings"],
  },
  {
    lock: STORAGE_LOCKS.API_VERIFICATION_HISTORY,
    keys: [STORAGE_KEYS.VERIFICATION_RESULT_HISTORY],
    scopes: ["history"],
  },
  {
    lock: STORAGE_LOCKS.DAILY_BALANCE_HISTORY,
    keys: [STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE],
    scopes: ["history"],
  },
  {
    lock: STORAGE_LOCKS.USAGE_HISTORY,
    keys: [USAGE_HISTORY_STORAGE_KEYS.STORE],
    scopes: ["history"],
  },
  {
    lock: STORAGE_LOCKS.PROTECTION_BYPASS_HISTORY,
    keys: [STORAGE_KEYS.PROTECTION_BYPASS_HISTORY],
    scopes: ["history"],
  },
  {
    lock: STORAGE_LOCKS.WEB_AI_API_CHECK,
    keys: [STORAGE_KEYS.BASE_URL_HISTORY, STORAGE_KEYS.CONTEXT_CHECKPOINTS],
    scopes: ["history"],
  },
  {
    lock: STORAGE_LOCKS.OPTIONS_SEARCH_RECENT_ITEMS,
    keys: [STORAGE_KEYS.RECENT_ITEM_IDS],
    scopes: ["history"],
  },
  {
    lock: STORAGE_LOCKS.LDOH_SITE_LOOKUP,
    keys: [STORAGE_KEYS.SITE_LIST_CACHE],
    scopes: ["caches"],
  },
  {
    lock: STORAGE_LOCKS.SPONSOR_CATALOG,
    keys: [
      STORAGE_KEYS.SPONSOR_CATALOG_CACHE,
      STORAGE_KEYS.SPONSOR_CATALOG_VERSIONED_CACHE,
    ],
    scopes: ["caches"],
  },
  {
    lock: STORAGE_LOCKS.RELEASE_UPDATE,
    keys: [STORAGE_KEYS.RELEASE_UPDATE_STATUS],
    scopes: ["caches"],
  },
  {
    lock: STORAGE_LOCKS.ACCOUNT_STORAGE,
    keys: [
      STORAGE_KEYS.ACCOUNTS,
      STORAGE_KEYS.TAG_STORE,
      STORAGE_KEYS.REPAIR_PROGRESS,
    ],
    scopes: ["accounts"],
  },
  {
    lock: STORAGE_LOCKS.LOGIN_PROVIDER_EVIDENCE,
    keys: [STORAGE_KEYS.EVIDENCE],
    scopes: ["accounts"],
  },
  {
    lock: STORAGE_LOCKS.AIMLAPI_ONBOARDING,
    keys: [AIMLAPI_ONBOARDING_STORAGE_KEY],
    scopes: ["accounts"],
  },
  {
    lock: STORAGE_LOCKS.ACCOUNT_DIALOG_RECOVERY,
    keys: [],
    prefixes: Object.values(ACCOUNT_DIALOG_RECOVERY_STORAGE_KEYS),
    scopes: ["accounts"],
  },
  {
    lock: STORAGE_LOCKS.SPONSOR_WORKFLOW,
    keys: [],
    prefixes: Object.values(SPONSOR_WORKFLOW_STORAGE_KEYS),
    scopes: ["accounts"],
  },
  {
    lock: STORAGE_LOCKS.API_CREDENTIAL_PROFILES,
    keys: [STORAGE_KEYS.API_CREDENTIAL_PROFILES],
    scopes: ["accounts"],
  },
  {
    lock: STORAGE_LOCKS.CHANNEL_CONFIG,
    keys: [STORAGE_KEYS.CHANNEL_CONFIGS, STORAGE_KEYS.CHANNEL_RESOURCE_CONFIGS],
  },
  {
    lock: STORAGE_LOCKS.LEGACY_CHANNEL_CONFIG_MIGRATION,
    keys: [
      STORAGE_KEYS.LEGACY_MIGRATION_STATE,
      STORAGE_KEYS.LEGACY_REPLACEMENT_STATE,
    ],
  },
  {
    lock: STORAGE_LOCKS.AUTO_CHECKIN_STATUS,
    keys: [AUTO_CHECKIN_STORAGE_KEYS.AUTO_CHECKIN_STATUS],
    scopes: ["accounts", "history"],
  },
  { lock: STORAGE_LOCKS.LOG_HISTORY, keys: [STORAGE_KEYS.LOG_HISTORY] },
  {
    lock: STORAGE_LOCKS.DEV_FIXTURE_ACCOUNTS,
    keys: [STORAGE_KEYS.DEV_FIXTURE_ACCOUNT_IDS],
    scopes: ["accounts"],
  },
  {
    lock: STORAGE_LOCKS.DEV_FIXTURE_API_CREDENTIALS,
    keys: [STORAGE_KEYS.DEV_FIXTURE_API_CREDENTIAL_IDS],
    scopes: ["accounts"],
  },
  {
    lock: STORAGE_LOCKS.ACCOUNT_BROWSER_IDENTITY_RATE_LIMIT,
    keys: [STORAGE_KEYS.RATE_LIMITS],
    scopes: ["accounts"],
  },
  {
    lock: STORAGE_LOCKS.SITE_TYPE_OBSERVATIONS,
    keys: [SITE_TYPE_OBSERVATION_STORAGE_KEYS.OBSERVATIONS],
    scopes: ["accounts"],
  },
  {
    lock: STORAGE_LOCKS.FEATURE_GUIDANCE,
    keys: [STORAGE_KEYS.FEATURE_GUIDANCE_STATE],
  },
  {
    lock: STORAGE_LOCKS.PRODUCT_ANALYTICS,
    keys: [
      STORAGE_KEYS.PRODUCT_ANALYTICS_PREFERENCES,
      STORAGE_KEYS.PRODUCT_ANALYTICS_STATE,
    ],
  },
  {
    lock: STORAGE_LOCKS.CHANGELOG_ON_UPDATE,
    keys: [STORAGE_KEYS.CHANGELOG_ON_UPDATE_PENDING_VERSION],
  },
  {
    lock: STORAGE_LOCKS.SITE_ANNOUNCEMENTS,
    keys: [STORAGE_KEYS.SITE_ANNOUNCEMENTS_STORE],
  },
  {
    lock: STORAGE_LOCKS.PRODUCT_ANNOUNCEMENTS,
    keys: [STORAGE_KEYS.PRODUCT_ANNOUNCEMENTS_STATE],
  },
  {
    lock: STORAGE_LOCKS.STAR_PROMOTION,
    keys: [STORAGE_KEYS.STAR_PROMOTION_STATE],
  },
  {
    lock: STORAGE_LOCKS.UNINSTALL_SURVEY,
    keys: [STORAGE_KEYS.UNINSTALL_SURVEY_STATE],
  },
  {
    lock: STORAGE_LOCKS.POPUP_INTERRUPTION_HINT,
    keys: [STORAGE_KEYS.POPUP_INTERRUPTION_HINT],
  },
  { lock: STORAGE_LOCKS.DAHL_KEY_NAMES, keys: [STORAGE_KEYS.DAHL_KEY_NAMES] },
]

/**
 * Development reset for an idle extension. Store removals join their existing
 * write locks; the caller reloads the extension after a successful cleanup.
 */
export async function clearDevData(
  scopes: readonly DevDataCleanupScope[],
): Promise<void> {
  if (!isDevelopmentMode())
    throw new Error("Data cleanup is only available in development builds")
  if (
    !Array.isArray(scopes) ||
    scopes.length === 0 ||
    scopes.some((scope) => !cleanupScopes.includes(scope))
  ) {
    throw new Error("Select at least one valid cleanup scope")
  }
  return withExtensionStorageWriteLock(STORAGE_LOCKS.DEV_DATA_CLEANUP, () =>
    clearSelectedData(scopes),
  )
}

/** Applies selected scopes sequentially, stopping at the first storage failure. */
async function clearSelectedData(
  scopes: readonly DevDataCleanupScope[],
): Promise<void> {
  const all = scopes.includes("all")
  if (all) await clearAllAlarms()
  if (!all && !scopes.includes("accounts") && scopes.includes("fixtures")) {
    await clearDevFixtureAccounts()
    await clearDevFixtureApiCredentials()
  }
  if (all || scopes.includes("history")) await clearLogHistory()
  for (const store of localStores) {
    if (all || store.scopes?.some((scope) => scopes.includes(scope))) {
      await withExtensionStorageWriteLock(store.lock, async () => {
        const prefixedKeys = store.prefixes
          ? Object.keys(await getLocalStorageValues()).filter((key) =>
              store.prefixes!.some((prefix) => key.startsWith(prefix)),
            )
          : []
        await removeLocalStorage([...store.keys, ...prefixedKeys])
      })
    }
  }
  if (all || scopes.includes("accounts"))
    await removeSessionStorageValues(
      ACCOUNT_KEY_AUTO_PROVISIONING_STORAGE_KEYS.REPAIR_CREATED_RUNTIME_SECRETS,
    )
  if (
    !all &&
    scopes.includes("settings") &&
    typeof localStorage !== "undefined"
  ) {
    localStorage.removeItem(I18NEXT_LANGUAGE_STORAGE_KEY)
    localStorage.removeItem(THEME_BOOTSTRAP_CACHE_KEY)
  }
  if (all) {
    // Remove other extension-owned keys too, including keys from older builds.
    // Known stores above are removed under their own locks; do not hold several
    // store locks together, because workflows can acquire them in nested order.
    const knownKeys = new Set(localStores.flatMap((store) => [...store.keys]))
    const knownPrefixes = localStores.flatMap((store) => [
      ...(store.prefixes ?? []),
    ])
    const otherKeys = Object.keys(await getLocalStorageValues()).filter(
      (key) =>
        !knownKeys.has(key) &&
        !knownPrefixes.some((prefix) => key.startsWith(prefix)),
    )
    await removeLocalStorage(otherKeys)
    await clearSyncStorage()
    await clearSessionStorage()
    if (typeof localStorage !== "undefined") localStorage.clear()
    if (typeof sessionStorage !== "undefined") sessionStorage.clear()
  }
  if ((all || scopes.includes("caches")) && typeof caches !== "undefined") {
    await withExtensionStorageWriteLock(
      STORAGE_LOCKS.COMMUNITY_RESOURCES,
      async () => {
        for (const name of await caches.keys()) {
          if (!(await caches.delete(name)))
            throw new Error(`Could not remove cache: ${name}`)
        }
      },
    )
  }
}
