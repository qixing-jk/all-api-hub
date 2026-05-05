import {
  buildControlDefinition,
  buildSectionDefinition,
  DEFAULT_BREADCRUMBS,
} from "~/entrypoints/options/search/registryHelpers"
import type { OptionsSearchItemDefinition } from "~/entrypoints/options/search/types"
import { SortingCriteriaType } from "~/types/sorting"

import { getSortingCriteriaTargetId } from "./SortingPrioritySettings/search"

export const accountManagementSearchSections: OptionsSearchItemDefinition[] = [
  buildSectionDefinition(
    "section:account-page",
    "accountManagement",
    "account-management",
    "settings:accountManagement.title",
    220,
  ),
  buildSectionDefinition(
    "section:auto-provision-key",
    "accountManagement",
    "auto-provision-key-on-account-add",
    "settings:autoProvisionKeyOnAccountAdd.title",
    221,
  ),
  buildSectionDefinition(
    "section:auto-fill-current-site",
    "accountManagement",
    "auto-fill-current-site-url-on-account-add",
    "settings:autoFillCurrentSiteUrlOnAccountAdd.title",
    222,
  ),
  buildSectionDefinition(
    "section:duplicate-account-warning",
    "accountManagement",
    "duplicate-account-warning-on-add",
    "settings:duplicateAccountWarningOnAdd.title",
    223,
  ),
  buildSectionDefinition(
    "section:sorting-priority",
    "accountManagement",
    "sorting-priority",
    "settings:sorting.title",
    224,
  ),
]

export const accountManagementSearchControls: OptionsSearchItemDefinition[] = [
  buildControlDefinition(
    "control:auto-provision-key",
    "accountManagement",
    "auto-provision-key-toggle",
    "settings:autoProvisionKeyOnAccountAdd.toggleLabel",
    520,
    {
      descriptionKey: "settings:autoProvisionKeyOnAccountAdd.toggleDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.accountManagement",
        "settings:autoProvisionKeyOnAccountAdd.title",
      ],
      keywords: ["key", "token", "api key"],
    },
  ),
  buildControlDefinition(
    "control:auto-fill-current-site-url",
    "accountManagement",
    "auto-fill-current-site-url-toggle",
    "settings:autoFillCurrentSiteUrlOnAccountAdd.toggleLabel",
    521,
    {
      descriptionKey: "settings:autoFillCurrentSiteUrlOnAccountAdd.toggleDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.accountManagement",
        "settings:autoFillCurrentSiteUrlOnAccountAdd.title",
      ],
      keywords: ["prefill", "url", "current site"],
    },
  ),
  buildControlDefinition(
    "control:duplicate-account-warning",
    "accountManagement",
    "duplicate-account-warning-toggle",
    "settings:duplicateAccountWarningOnAdd.toggleLabel",
    522,
    {
      descriptionKey: "settings:duplicateAccountWarningOnAdd.toggleDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.accountManagement",
        "settings:duplicateAccountWarningOnAdd.title",
      ],
      keywords: ["duplicate", "warn", "account"],
    },
  ),
  buildControlDefinition(
    "control:sorting-disabled-account",
    "accountManagement",
    getSortingCriteriaTargetId(SortingCriteriaType.DISABLED_ACCOUNT),
    "settings:sorting.disabledAccount",
    523,
    {
      descriptionKey: "settings:sorting.disabledAccountDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.accountManagement",
        "settings:sorting.title",
      ],
      keywords: ["sorting", "priority", "disabled account"],
    },
  ),
  buildControlDefinition(
    "control:sorting-pinned",
    "accountManagement",
    getSortingCriteriaTargetId(SortingCriteriaType.PINNED),
    "settings:sorting.pinnedPriority",
    524,
    {
      descriptionKey: "settings:sorting.pinnedDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.accountManagement",
        "settings:sorting.title",
      ],
      keywords: ["sorting", "priority", "pinned"],
    },
  ),
  buildControlDefinition(
    "control:sorting-manual-order",
    "accountManagement",
    getSortingCriteriaTargetId(SortingCriteriaType.MANUAL_ORDER),
    "settings:sorting.manualOrder",
    525,
    {
      descriptionKey: "settings:sorting.manualOrderDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.accountManagement",
        "settings:sorting.title",
      ],
      keywords: ["sorting", "priority", "manual order"],
    },
  ),
  buildControlDefinition(
    "control:sorting-current-site",
    "accountManagement",
    getSortingCriteriaTargetId(SortingCriteriaType.CURRENT_SITE),
    "settings:sorting.currentSitePriority",
    526,
    {
      descriptionKey: "settings:sorting.currentSiteDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.accountManagement",
        "settings:sorting.title",
      ],
      keywords: ["sorting", "priority", "current site", "site match"],
    },
  ),
  buildControlDefinition(
    "control:sorting-health-status",
    "accountManagement",
    getSortingCriteriaTargetId(SortingCriteriaType.HEALTH_STATUS),
    "settings:sorting.healthStatus",
    527,
    {
      descriptionKey: "settings:sorting.healthDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.accountManagement",
        "settings:sorting.title",
      ],
      keywords: ["sorting", "priority", "health", "status"],
    },
  ),
  buildControlDefinition(
    "control:sorting-checkin-requirement",
    "accountManagement",
    getSortingCriteriaTargetId(SortingCriteriaType.CHECK_IN_REQUIREMENT),
    "settings:sorting.checkInRequirement",
    528,
    {
      descriptionKey: "settings:sorting.checkInDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.accountManagement",
        "settings:sorting.title",
      ],
      keywords: ["sorting", "priority", "checkin", "check-in"],
    },
  ),
  buildControlDefinition(
    "control:sorting-user-custom-sort",
    "accountManagement",
    getSortingCriteriaTargetId(SortingCriteriaType.USER_SORT_FIELD),
    "settings:sorting.userCustomSort",
    529,
    {
      descriptionKey: "settings:sorting.customSortDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.accountManagement",
        "settings:sorting.title",
      ],
      keywords: ["sorting", "priority", "custom sort", "user sort"],
    },
  ),
  buildControlDefinition(
    "control:sorting-custom-checkin-url",
    "accountManagement",
    getSortingCriteriaTargetId(SortingCriteriaType.CUSTOM_CHECK_IN_URL),
    "settings:sorting.customCheckInUrl",
    530,
    {
      descriptionKey: "settings:sorting.customCheckInDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.accountManagement",
        "settings:sorting.title",
      ],
      keywords: ["sorting", "priority", "custom checkin url", "check-in url"],
    },
  ),
  buildControlDefinition(
    "control:sorting-custom-redeem-url",
    "accountManagement",
    getSortingCriteriaTargetId(SortingCriteriaType.CUSTOM_REDEEM_URL),
    "settings:sorting.customRedeemUrl",
    531,
    {
      descriptionKey: "settings:sorting.customRedeemDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.accountManagement",
        "settings:sorting.title",
      ],
      keywords: ["sorting", "priority", "custom redeem url", "redeem url"],
    },
  ),
  buildControlDefinition(
    "control:sorting-matched-open-tabs",
    "accountManagement",
    getSortingCriteriaTargetId(SortingCriteriaType.MATCHED_OPEN_TABS),
    "settings:sorting.matchedOpenTabs",
    532,
    {
      descriptionKey: "settings:sorting.matchedOpenTabsDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.accountManagement",
        "settings:sorting.title",
      ],
      keywords: ["sorting", "priority", "matched open tabs", "open tabs"],
    },
  ),
]
