import { vi } from "vitest"

import {
  CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_SELECTION_MODES,
} from "~/constants/checkIn"
import type { AccountSiteType } from "~/constants/siteType"
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
export function createAccountCompletionCheckInConfigMock(
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
