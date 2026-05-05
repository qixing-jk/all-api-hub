import {
  buildControlDefinition,
  buildSectionDefinition,
  DEFAULT_BREADCRUMBS,
} from "~/entrypoints/options/search/registryHelpers"
import type { OptionsSearchItemDefinition } from "~/entrypoints/options/search/types"

export const checkinRedeemSearchSections: OptionsSearchItemDefinition[] = [
  buildSectionDefinition(
    "section:auto-checkin",
    "checkinRedeem",
    "auto-checkin",
    "autoCheckin:settings.title",
    260,
  ),
  buildSectionDefinition(
    "section:redemption-assist",
    "checkinRedeem",
    "redemption-assist",
    "redemptionAssist:settings.title",
    261,
  ),
]

export const checkinRedeemSearchControls: OptionsSearchItemDefinition[] = [
  buildControlDefinition(
    "control:auto-checkin-global-enabled",
    "checkinRedeem",
    "auto-checkin-enable",
    "autoCheckin:settings.enable",
    560,
    {
      descriptionKey: "autoCheckin:settings.enableDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.checkinRedeem",
        "autoCheckin:settings.title",
      ],
      keywords: ["auto checkin", "check-in", "sign in"],
    },
  ),
  buildControlDefinition(
    "control:auto-checkin-window-start",
    "checkinRedeem",
    "auto-checkin-window-start",
    "autoCheckin:settings.windowStart",
    561,
    {
      descriptionKey: "autoCheckin:settings.windowStartDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.checkinRedeem",
        "autoCheckin:settings.title",
      ],
      keywords: ["window", "schedule", "time"],
    },
  ),
  buildControlDefinition(
    "control:auto-checkin-window-end",
    "checkinRedeem",
    "auto-checkin-window-end",
    "autoCheckin:settings.windowEnd",
    562,
    {
      descriptionKey: "autoCheckin:settings.windowEndDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.checkinRedeem",
        "autoCheckin:settings.title",
      ],
      keywords: ["window", "schedule", "time"],
    },
  ),
  buildControlDefinition(
    "control:auto-checkin-schedule-mode",
    "checkinRedeem",
    "auto-checkin-schedule-mode",
    "autoCheckin:settings.scheduleModeTitle",
    563,
    {
      descriptionKey: "autoCheckin:settings.scheduleModeDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.checkinRedeem",
        "autoCheckin:settings.title",
      ],
      keywords: ["schedule", "random", "deterministic"],
    },
  ),
  buildControlDefinition(
    "control:auto-checkin-pretrigger-ui-open",
    "checkinRedeem",
    "auto-checkin-pretrigger-ui-open",
    "autoCheckin:settings.pretriggerDailyOnUiOpen",
    564,
    {
      descriptionKey: "autoCheckin:settings.pretriggerDailyOnUiOpenDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.checkinRedeem",
        "autoCheckin:settings.title",
      ],
      keywords: ["auto checkin", "pretrigger", "ui open"],
    },
  ),
  buildControlDefinition(
    "control:auto-checkin-notify-ui-on-completion",
    "checkinRedeem",
    "auto-checkin-notify-ui-on-completion",
    "autoCheckin:settings.notifyUiOnCompletion",
    565,
    {
      descriptionKey: "autoCheckin:settings.notifyUiOnCompletionDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.checkinRedeem",
        "autoCheckin:settings.title",
      ],
      keywords: ["auto checkin", "notify", "ui refresh"],
    },
  ),
  buildControlDefinition(
    "control:auto-checkin-deterministic-time",
    "checkinRedeem",
    "auto-checkin-deterministic-time",
    "autoCheckin:settings.deterministicTimeTitle",
    566,
    {
      descriptionKey: "autoCheckin:settings.deterministicTimeDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.checkinRedeem",
        "autoCheckin:settings.title",
      ],
      keywords: ["auto checkin", "deterministic", "time"],
    },
  ),
  buildControlDefinition(
    "control:auto-checkin-retry-enabled",
    "checkinRedeem",
    "auto-checkin-retry-enabled",
    "autoCheckin:settings.retryTitle",
    567,
    {
      descriptionKey: "autoCheckin:settings.retryDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.checkinRedeem",
        "autoCheckin:settings.title",
      ],
      keywords: ["auto checkin", "retry"],
    },
  ),
  buildControlDefinition(
    "control:auto-checkin-retry-interval",
    "checkinRedeem",
    "auto-checkin-retry-interval",
    "autoCheckin:settings.retryInterval",
    568,
    {
      descriptionKey: "autoCheckin:settings.retryIntervalDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.checkinRedeem",
        "autoCheckin:settings.title",
      ],
      keywords: ["auto checkin", "retry", "interval"],
    },
  ),
  buildControlDefinition(
    "control:auto-checkin-retry-max-attempts",
    "checkinRedeem",
    "auto-checkin-retry-max-attempts",
    "autoCheckin:settings.retryMaxAttempts",
    569,
    {
      descriptionKey: "autoCheckin:settings.retryMaxAttemptsDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.checkinRedeem",
        "autoCheckin:settings.title",
      ],
      keywords: ["auto checkin", "retry", "attempts"],
    },
  ),
  buildControlDefinition(
    "control:auto-checkin-view-execution",
    "checkinRedeem",
    "auto-checkin-view-execution",
    "autoCheckin:settings.viewExecution",
    570,
    {
      descriptionKey: "autoCheckin:settings.viewExecutionDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.checkinRedeem",
        "autoCheckin:settings.title",
      ],
      keywords: ["auto checkin", "execution", "history"],
    },
  ),
  buildControlDefinition(
    "control:redemption-assist-enabled",
    "checkinRedeem",
    "redemption-assist-enable",
    "redemptionAssist:settings.enable",
    571,
    {
      descriptionKey: "redemptionAssist:settings.enableDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.checkinRedeem",
        "redemptionAssist:settings.title",
      ],
      keywords: ["redeem", "redemption", "assistant"],
    },
  ),
  buildControlDefinition(
    "control:redemption-assist-context-menu-enable",
    "checkinRedeem",
    "redemption-assist-context-menu-enable",
    "redemptionAssist:settings.contextMenu.enable",
    572,
    {
      descriptionKey: "redemptionAssist:settings.contextMenu.enableDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.checkinRedeem",
        "redemptionAssist:settings.title",
      ],
      keywords: ["redeem", "context menu"],
    },
  ),
  buildControlDefinition(
    "control:redemption-assist-relaxed-code-validation",
    "checkinRedeem",
    "redemption-assist-relaxed-code-validation",
    "redemptionAssist:settings.relaxedCodeValidation",
    573,
    {
      descriptionKey: "redemptionAssist:settings.relaxedCodeValidationDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.checkinRedeem",
        "redemptionAssist:settings.title",
      ],
      keywords: ["redeem", "validation", "code"],
    },
  ),
  buildControlDefinition(
    "control:redemption-assist-url-whitelist-enable",
    "checkinRedeem",
    "redemption-assist-url-whitelist-enable",
    "redemptionAssist:settings.urlWhitelist.enable",
    574,
    {
      descriptionKey: "redemptionAssist:settings.urlWhitelist.enableDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.checkinRedeem",
        "redemptionAssist:settings.title",
      ],
      keywords: ["redeem", "whitelist", "url"],
    },
  ),
  buildControlDefinition(
    "control:redemption-assist-include-account-site-urls",
    "checkinRedeem",
    "redemption-assist-include-account-site-urls",
    "redemptionAssist:settings.urlWhitelist.includeAccountSiteUrls",
    575,
    {
      descriptionKey:
        "redemptionAssist:settings.urlWhitelist.includeAccountSiteUrlsDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.checkinRedeem",
        "redemptionAssist:settings.title",
      ],
      keywords: ["redeem", "whitelist", "account urls"],
    },
  ),
  buildControlDefinition(
    "control:redemption-assist-include-checkin-redeem-urls",
    "checkinRedeem",
    "redemption-assist-include-checkin-redeem-urls",
    "redemptionAssist:settings.urlWhitelist.includeCheckInAndRedeemUrls",
    576,
    {
      descriptionKey:
        "redemptionAssist:settings.urlWhitelist.includeCheckInAndRedeemUrlsDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.checkinRedeem",
        "redemptionAssist:settings.title",
      ],
      keywords: ["redeem", "whitelist", "checkin urls"],
    },
  ),
  buildControlDefinition(
    "control:redemption-assist-url-whitelist-patterns",
    "checkinRedeem",
    "redemption-assist-url-whitelist-patterns",
    "redemptionAssist:settings.urlWhitelist.patterns",
    577,
    {
      descriptionKey: "redemptionAssist:settings.urlWhitelist.patternsDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.checkinRedeem",
        "redemptionAssist:settings.title",
      ],
      keywords: ["redeem", "whitelist", "patterns"],
    },
  ),
]
