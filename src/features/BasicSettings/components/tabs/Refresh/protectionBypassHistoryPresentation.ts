import type { TFunction } from "i18next"

import {
  getTempContextTaskMetadata,
  PROTECTION_BYPASS_USER_COMMAND_FEATURES,
} from "~/services/protectionBypass/contracts"
import type { ProtectionBypassHistoryEntry } from "~/services/protectionBypass/historyStorage"

import { SHIELD_SETTINGS_TARGET_IDS } from "./searchTargets"

/** Keep diagnostic vocabulary in the feature layer and every translation extractable. */
export function getProtectionBypassHistoryLabels(t: TFunction) {
  return {
    statuses: {
      started: t("shieldBypass:history.statuses.started"),
      completed: t("shieldBypass:history.statuses.completed"),
      failed: t("shieldBypass:history.statuses.failed"),
      denied: t("shieldBypass:history.statuses.denied"),
      unavailable: t("shieldBypass:history.statuses.unavailable"),
    },
    features: {
      account_refresh: t(
        "settings:refresh.shieldAutomaticFeatureAccountRefresh",
      ),
      balance_history: t(
        "settings:refresh.shieldAutomaticFeatureBalanceHistory",
      ),
      checkin: t("settings:refresh.shieldAutomaticFeatureCheckin"),
      redemption_assist: t(
        "settings:refresh.shieldAutomaticFeatureRedemptionAssist",
      ),
      ldoh_site_lookup: t(
        "settings:refresh.shieldAutomaticFeatureLdohSiteLookup",
      ),
      key_management: t("settings:refresh.shieldAutomaticFeatureKeyManagement"),
      managed_site_channels: t(
        "settings:refresh.shieldAutomaticFeatureManagedSiteChannels",
      ),
      managed_site_model_sync: t(
        "settings:refresh.shieldAutomaticFeatureManagedSiteModelSync",
      ),
      account_onboarding: t("shieldBypass:history.accountOnboarding"),
    },
    commands: {
      refresh_account: t("shieldBypass:history.commands.refresh_account"),
      refresh_all_accounts: t(
        "shieldBypass:history.commands.refresh_all_accounts",
      ),
      refresh_disabled_accounts: t(
        "shieldBypass:history.commands.refresh_disabled_accounts",
      ),
      manual_checkin: t("shieldBypass:history.commands.manual_checkin"),
      retry_checkin_account: t(
        "shieldBypass:history.commands.retry_checkin_account",
      ),
      add_account: t("shieldBypass:history.commands.add_account"),
      detect_account: t("shieldBypass:history.commands.detect_account"),
      reauthenticate_account: t(
        "shieldBypass:history.commands.reauthenticate_account",
      ),
      manage_api_keys: t("shieldBypass:history.commands.manage_api_keys"),
      manage_site_channels: t(
        "shieldBypass:history.commands.manage_site_channels",
      ),
      sync_managed_site_models: t(
        "shieldBypass:history.commands.sync_managed_site_models",
      ),
    },
    triggers: {
      ui_lifecycle: t("shieldBypass:history.triggers.ui_lifecycle"),
      scheduled: t("shieldBypass:history.triggers.scheduled"),
      retry: t("shieldBypass:history.triggers.retry"),
      background_recovery: t(
        "shieldBypass:history.triggers.background_recovery",
      ),
    },
    surfaces: {
      popup: t("shieldBypass:history.surfaces.popup"),
      options: t("shieldBypass:history.surfaces.options"),
      sidepanel: t("shieldBypass:history.surfaces.sidepanel"),
      content_script: t("shieldBypass:history.surfaces.content_script"),
      background: t("shieldBypass:history.surfaces.background"),
    },
    causes: {
      api_error_fallback: t("shieldBypass:history.causes.api_error_fallback"),
      browser_profile_isolation: t(
        "shieldBypass:history.causes.browser_profile_isolation",
      ),
      verification_required: t(
        "shieldBypass:history.causes.verification_required",
      ),
      rendered_page_required: t(
        "shieldBypass:history.causes.rendered_page_required",
      ),
      session_required: t("shieldBypass:history.causes.session_required"),
      explicit_context: t("shieldBypass:history.causes.explicit_context"),
    },
    modes: {
      auto: t("settings:refresh.shieldMethodAuto"),
      tab: t("settings:refresh.shieldMethodTab"),
      composite: t("settings:refresh.shieldMethodComposite"),
      window: t("settings:refresh.shieldMethodWindow"),
    },
    denials: {
      automatic_disabled: t("shieldBypass:history.denials.automatic_disabled"),
      feature_disabled: t("shieldBypass:history.denials.feature_disabled"),
      missing_execution: t("shieldBypass:history.denials.missing_execution"),
      invalid_execution: t("shieldBypass:history.denials.invalid_execution"),
      task_not_permitted: t("shieldBypass:history.denials.task_not_permitted"),
      resource_stale: t("shieldBypass:history.denials.resource_stale"),
      permission_required: t(
        "shieldBypass:history.denials.permission_required",
      ),
      unsupported_environment: t(
        "shieldBypass:history.denials.unsupported_environment",
      ),
      policy_unavailable: t("shieldBypass:history.denials.policy_unavailable"),
    },
    failures: {
      firefox_popup_unsupported: t(
        "shieldBypass:history.failures.firefox_popup_unsupported",
      ),
      incognito_access_required: t(
        "shieldBypass:history.failures.incognito_access_required",
      ),
      execution_error: t("shieldBypass:history.failures.execution_error"),
      no_response: t("shieldBypass:history.failures.no_response"),
      identity_missing: t("shieldBypass:history.failures.identity_missing"),
      identity_mismatch: t("shieldBypass:history.failures.identity_mismatch"),
      invalid_request: t("shieldBypass:history.failures.invalid_request"),
      target_not_found: t("shieldBypass:history.failures.target_not_found"),
      throttled: t("shieldBypass:history.failures.throttled"),
      trigger_failed: t("shieldBypass:history.failures.trigger_failed"),
    },
    turnstile: {
      not_present: t("shieldBypass:history.turnstile.not_present"),
      token_obtained: t("shieldBypass:history.turnstile.token_obtained"),
      timeout: t("shieldBypass:history.turnstile.timeout"),
      error: t("shieldBypass:history.turnstile.error"),
    },
    mutations: {
      not_dispatched: t("shieldBypass:history.mutations.not_dispatched"),
      dispatched_unconfirmed: t(
        "shieldBypass:history.mutations.dispatched_unconfirmed",
      ),
      created: t("shieldBypass:history.mutations.created"),
    },
  }
}

/** Describe recorded facts without claiming that every temporary page encountered a shield. */
export function describeProtectionBypassHistory(
  entry: ProtectionBypassHistoryEntry,
  labels: ReturnType<typeof getProtectionBypassHistoryLabels>,
  t: TFunction,
) {
  const { execution } = entry
  const feature =
    execution.kind === "automatic"
      ? execution.feature
      : PROTECTION_BYPASS_USER_COMMAND_FEATURES[execution.command]
  const cause = getTempContextTaskMetadata({ kind: entry.taskKind }).cause
  return {
    operation:
      execution.kind === "user_command"
        ? labels.commands[execution.command]
        : labels.features[feature],
    trigger:
      execution.kind === "automatic"
        ? labels.triggers[execution.trigger]
        : t("shieldBypass:history.manual"),
    surface: labels.surfaces[execution.surface],
    cause:
      cause === "api_error_fallback" && !entry.fallbackDiagnostic
        ? t("shieldBypass:history.noOriginalError")
        : labels.causes[cause],
    status: labels.statuses[entry.status],
    evidence: [
      entry.fallbackDiagnostic?.statusCode
        ? `HTTP ${entry.fallbackDiagnostic.statusCode}`
        : undefined,
      entry.fallbackDiagnostic?.code,
    ]
      .filter(Boolean)
      .join(" · "),
    summaryEvidence: entry.fallbackDiagnostic?.statusCode
      ? `HTTP ${entry.fallbackDiagnostic.statusCode}`
      : entry.fallbackDiagnostic?.code ?? "",
    result: [
      entry.httpStatus ? `HTTP ${entry.httpStatus}` : undefined,
      entry.errorCode,
    ]
      .filter(Boolean)
      .join(" · "),
    reason: entry.denialReason
      ? labels.denials[entry.denialReason]
      : entry.mutationState === "dispatched_unconfirmed"
        ? labels.mutations.dispatched_unconfirmed
        : entry.failureReason
          ? labels.failures[entry.failureReason]
          : entry.turnstileStatus === "timeout" ||
              entry.turnstileStatus === "error"
            ? labels.turnstile[entry.turnstileStatus]
            : "",
    verification: entry.turnstileStatus
      ? labels.turnstile[entry.turnstileStatus]
      : "",
    mutation: entry.mutationState ? labels.mutations[entry.mutationState] : "",
    context:
      entry.contextReused === undefined
        ? entry.status === "denied"
          ? labels.statuses.denied
          : ""
        : entry.contextReused
          ? t("shieldBypass:history.reused")
          : t("shieldBypass:history.created"),
    settingsTarget:
      entry.denialReason === "automatic_disabled"
        ? SHIELD_SETTINGS_TARGET_IDS.enabled
        : entry.denialReason === "feature_disabled" &&
            execution.kind === "automatic"
          ? SHIELD_SETTINGS_TARGET_IDS.feature[execution.feature]
          : undefined,
  }
}
