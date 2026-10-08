import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import {
  TOOLBAR_ACTION_CLICK_BEHAVIORS,
  type UserPreferences,
} from "~/services/preferences/preferencesSchema"
import { DEFAULT_SORTING_PRIORITY_CONFIG } from "~/services/preferences/utils/sortingPriority"
import {
  PRODUCT_ANALYTICS_SETTING_IDS,
  PRODUCT_ANALYTICS_SORT_FIELDS,
  type ProductAnalyticsEntrypoint,
} from "~/services/productAnalytics/contracts"
import type { SortingPriorityConfig } from "~/types/sorting"
import { normalizeAppLanguage } from "~/utils/i18n/language"

import {
  normalizeNonNegativeInteger,
  type SettingChangedPayload,
} from "./values"
import type { SettingsSnapshotProjection } from "./values"

/** Project app preferences into privacy-reviewed analytics facts. */
function buildAppPreferencesSnapshot(
  preferences: UserPreferences,
  entrypoint: ProductAnalyticsEntrypoint,
): SettingChangedPayload {
  return {
    setting_id: PRODUCT_ANALYTICS_SETTING_IDS.AppPreferencesSnapshot,
    entrypoint,
    theme_mode: preferences.themeMode ?? DEFAULT_PREFERENCES.themeMode,
    normalized_language:
      normalizeAppLanguage(preferences.language) ?? FALLBACK_LANGUAGE,
    toolbar_action_click_behavior: getActionClickBehavior(
      preferences.actionClickBehavior,
    ),
    open_changelog_on_update_enabled:
      preferences.openChangelogOnUpdate !== false,
  }
}

const FALLBACK_LANGUAGE = "en"

/** Normalize legacy toolbar behavior for the settings snapshot. */
function getActionClickBehavior(
  behavior: UserPreferences["actionClickBehavior"] | undefined,
) {
  if (behavior === TOOLBAR_ACTION_CLICK_BEHAVIORS.Options) {
    return TOOLBAR_ACTION_CLICK_BEHAVIORS.Options
  }
  return behavior === TOOLBAR_ACTION_CLICK_BEHAVIORS.SidePanel
    ? TOOLBAR_ACTION_CLICK_BEHAVIORS.SidePanel
    : TOOLBAR_ACTION_CLICK_BEHAVIORS.Popup
}

/** Project display preferences into privacy-reviewed analytics facts. */
function buildDisplayPreferencesSnapshot(
  preferences: UserPreferences,
  entrypoint: ProductAnalyticsEntrypoint,
): SettingChangedPayload {
  const sortingPriorityConfig = getSortingPriorityPreferences(preferences)
  return {
    setting_id: PRODUCT_ANALYTICS_SETTING_IDS.DisplayPreferencesSnapshot,
    entrypoint,
    active_tab: preferences.activeTab,
    currency_type: preferences.currencyType,
    show_today_cashflow_enabled: preferences.showTodayCashflow !== false,
    sort_field: preferences.sortField ?? PRODUCT_ANALYTICS_SORT_FIELDS.None,
    sort_order: preferences.sortOrder,
    sorting_priority_configured: Boolean(sortingPriorityConfig),
    sorting_priority_customized: isSortingPriorityCustomized(
      sortingPriorityConfig,
    ),
    sorting_priority_enabled_criteria_count: normalizeNonNegativeInteger(
      sortingPriorityConfig?.criteria.filter((criterion) => criterion.enabled)
        .length ??
        DEFAULT_SORTING_PRIORITY_CONFIG.criteria.filter(
          (criterion) => criterion.enabled,
        ).length,
    ),
  }
}

/** Read the saved sorting priority facts for display analytics. */
function getSortingPriorityPreferences(
  preferences: UserPreferences,
): SortingPriorityConfig | undefined {
  return preferences.sortingPriorityConfig
}

/** Compare sorting criteria with defaults without recording user data. */
function isSortingPriorityCustomized(
  config: SortingPriorityConfig | undefined,
): boolean {
  if (!config) return false

  const defaultById = new Map(
    DEFAULT_SORTING_PRIORITY_CONFIG.criteria.map((criterion) => [
      criterion.id,
      criterion,
    ]),
  )

  if (
    config.criteria.length !== DEFAULT_SORTING_PRIORITY_CONFIG.criteria.length
  ) {
    return true
  }

  return config.criteria.some((criterion) => {
    const defaultCriterion = defaultById.get(criterion.id)
    return (
      !defaultCriterion ||
      defaultCriterion.enabled !== criterion.enabled ||
      defaultCriterion.priority !== criterion.priority
    )
  })
}

/** Projects normalized account preferences into controlled analytics flags and modes. */
function buildAccountBehaviorSnapshot(
  preferences: UserPreferences,
  entrypoint: ProductAnalyticsEntrypoint,
): SettingChangedPayload {
  return {
    setting_id: PRODUCT_ANALYTICS_SETTING_IDS.AccountBehaviorSnapshot,
    entrypoint,
    auto_provision_key_on_account_add_enabled:
      preferences.autoProvisionKeyOnAccountAdd === true,
    auto_provision_key_on_account_add_mode:
      preferences.autoProvisionKeyOnAccountAddMode,
    auto_fill_current_site_url_on_account_add_enabled:
      preferences.autoFillCurrentSiteUrlOnAccountAdd === true,
    warn_on_duplicate_account_add_enabled:
      preferences.warnOnDuplicateAccountAdd !== false,
    show_today_cashflow_enabled: preferences.showTodayCashflow !== false,
    show_health_status_enabled: preferences.showHealthStatus === true,
  }
}

/** Project logging preferences into privacy-reviewed analytics facts. */
function buildLoggingPreferencesSnapshot(
  preferences: UserPreferences,
  entrypoint: ProductAnalyticsEntrypoint,
): SettingChangedPayload {
  const config = preferences.logging ?? DEFAULT_PREFERENCES.logging
  return {
    setting_id: PRODUCT_ANALYTICS_SETTING_IDS.LoggingPreferencesSnapshot,
    entrypoint,
    console_logging_enabled: config.consoleEnabled === true,
    log_level: config.level,
  }
}

/** Keep patch attribution beside the safe projection of each settings area. */
export const generalSettingsSnapshots = {
  app: {
    keys: [
      "themeMode",
      "language",
      "actionClickBehavior",
      "openChangelogOnUpdate",
    ],
    build: buildAppPreferencesSnapshot,
  },
  display: {
    keys: [
      "activeTab",
      "currencyType",
      "showTodayCashflow",
      "sortField",
      "sortOrder",
      "sortingPriorityConfig",
    ],
    build: buildDisplayPreferencesSnapshot,
  },
  account: {
    keys: [
      "autoProvisionKeyOnAccountAdd",
      "autoProvisionKeyOnAccountAddMode",
      "autoFillCurrentSiteUrlOnAccountAdd",
      "warnOnDuplicateAccountAdd",
      "showTodayCashflow",
      "showHealthStatus",
    ],
    build: buildAccountBehaviorSnapshot,
  },
  logging: { keys: ["logging"], build: buildLoggingPreferencesSnapshot },
} satisfies Record<string, SettingsSnapshotProjection>
