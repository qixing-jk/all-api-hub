import { vi } from "vitest"

import type { AutoDetectFailureReason } from "~/constants/autoDetect"
import {
  CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_SELECTION_MODES,
} from "~/constants/checkIn"
import type { AccountSiteType } from "~/constants/siteType"
import { AutoDetectCompletionError } from "~/services/accounts/autoDetectCompletion/types"
import type { AccountCompletionHelpers } from "~/services/apiAdapters/contracts/accountCompletion"
import { getLegacyAutoCheckinMethodIds } from "~/services/checkin/autoCheckin/providers/registry"
import type { CheckInConfig } from "~/types/checkIn"

interface CheckInFixtureOptions {
  automaticExecutionEnabled?: boolean
  matched?: boolean
  isCheckedInToday?: boolean
  observedAt?: number
}

/** Builds canonical runtime fixtures for account adapter/service tests. */
export function createCheckInConfig(
  siteType: AccountSiteType,
  options: CheckInFixtureOptions = {},
): CheckInConfig {
  const {
    automaticExecutionEnabled = true,
    matched = true,
    isCheckedInToday,
    observedAt = 1_700_000_000_000,
  } = options
  const methodId = getLegacyAutoCheckinMethodIds(siteType)[0]
  const hasMethod = matched && methodId !== undefined

  return {
    automaticExecutionEnabled,
    methodKnowledge: {
      methods: hasMethod
        ? {
            [methodId]: {
              detection: {
                outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched,
                evidence: {
                  source:
                    CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES.LegacyMigration,
                },
              },
              ...(typeof isCheckedInToday === "boolean"
                ? {
                    status: {
                      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
                      today: isCheckedInToday
                        ? CHECK_IN_METHOD_TODAY_STATUSES.Checked
                        : CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
                      evidence: {
                        source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
                        observedAt,
                      },
                    },
                  }
                : {}),
            },
          }
        : {},
    },
    selection: {
      mode: CHECK_IN_SELECTION_MODES.Automatic,
      ...(hasMethod ? { methodId } : {}),
    },
  }
}

/** Creates the shared account-completion check-in helper test double. */
function createAccountCompletionCheckInConfigMock(
  siteType: AccountSiteType,
  options: {
    automaticExecutionEnabled: boolean
    isCheckedInToday?: boolean
  },
) {
  return vi.fn(({ supported }: { supported: boolean }) => ({
    ...createCheckInConfig(siteType, {
      matched: supported,
      automaticExecutionEnabled: options.automaticExecutionEnabled,
      ...(typeof options.isCheckedInToday === "boolean"
        ? { isCheckedInToday: options.isCheckedInToday }
        : {}),
    }),
    customCheckIn: {
      url: "",
      redeemUrl: "",
      openRedeemWithCheckIn: true,
      isCheckedInToday: false,
    },
  }))
}

/** Creates the shared helper spies used by account-completion adapter tests. */
export function createAccountCompletionHelpersMock(
  siteType: AccountSiteType,
  options: {
    automaticExecutionEnabled: boolean
    isCheckedInToday?: boolean
  },
) {
  const createServiceRequest = vi.fn(
    ({
      baseUrl,
      auth,
      context,
    }: Parameters<AccountCompletionHelpers["createServiceRequest"]>[0]) => ({
      baseUrl,
      auth,
      ...(context.fetchContext ? { fetchContext: context.fetchContext } : {}),
    }),
  )
  const fetchSiteName = vi.fn(async (siteStatus) =>
    typeof siteStatus?.system_name === "string" && siteStatus.system_name.trim()
      ? siteStatus.system_name.trim()
      : "Example API",
  )
  const createCompletionError = vi.fn(
    (reason: AutoDetectFailureReason, cause: unknown) =>
      new AutoDetectCompletionError(reason, cause),
  )
  const trimString = vi.fn((value: unknown) =>
    typeof value === "string" ? value.trim() : "",
  )
  const createInitialCheckInConfig = createAccountCompletionCheckInConfigMock(
    siteType,
    options,
  )
  const handleCheckInSupportFetchFailure = vi.fn(() => false as const)
  const captureRecoveryData = vi.fn()
  const helpers = {
    createServiceRequest,
    fetchSiteName,
    createCompletionError,
    trimString,
    createInitialCheckInConfig,
    handleCheckInSupportFetchFailure,
    captureRecoveryData,
  } satisfies AccountCompletionHelpers

  return {
    helpers,
    createServiceRequest,
    fetchSiteName,
    createCompletionError,
    trimString,
    createInitialCheckInConfig,
    handleCheckInSupportFetchFailure,
    captureRecoveryData,
  }
}
