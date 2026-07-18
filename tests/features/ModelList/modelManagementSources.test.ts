import { describe, expect, it } from "vitest"

import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import {
  createAccountSource,
  createAllAccountsSource,
  createProfileSource,
  deriveModelListSourceCapabilities,
  MODEL_LIST_GROUP_SEMANTICS,
} from "~/features/ModelList/modelManagementSources"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import type { DisplaySiteData } from "~/types"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { buildCompleteTodayStatsAvailability } from "~~/tests/test-utils/accountTodayStats"

const createAccountFixture = (siteType: AccountSiteType): DisplaySiteData => ({
  id: `account-${siteType}`,
  name: "Example Account",
  username: "example-user",
  balance: { USD: 0, CNY: 0 },
  todayConsumption: { USD: 0, CNY: 0 },
  todayIncome: { USD: 0, CNY: 0 },
  todayTokens: { upload: 0, download: 0 },
  todayStatsAvailability: buildCompleteTodayStatsAvailability(),
  health: { status: SiteHealthStatus.Healthy },
  siteType,
  baseUrl: "https://account.example.invalid",
  token: "example-token",
  userId: "example-user-id",
  authType: AuthTypeEnum.AccessToken,
  checkIn: { enableDetection: false },
})

const PROFILE_FIXTURE: ApiCredentialProfile = {
  id: "profile-1",
  name: "Example Profile",
  apiType: API_TYPES.OPENAI_COMPATIBLE,
  baseUrl: "https://profile.example.invalid",
  apiKey: "example-key",
  tagIds: [],
  notes: "",
  createdAt: 1,
  updatedAt: 1,
}

describe("modelManagementSources group semantics", () => {
  it("marks account and aggregate sources as account-or-runtime-key scoped", () => {
    expect(
      createAccountSource(createAccountFixture(SITE_TYPES.NEW_API)),
    ).toHaveProperty(
      "groupSemantics",
      MODEL_LIST_GROUP_SEMANTICS.ACCOUNT_OR_RUNTIME_KEY,
    )
    expect(createAllAccountsSource()).toHaveProperty(
      "groupSemantics",
      MODEL_LIST_GROUP_SEMANTICS.ACCOUNT_OR_RUNTIME_KEY,
    )
  })

  it("marks credential profile sources as not applicable", () => {
    expect(createProfileSource(PROFILE_FIXTURE)).toHaveProperty(
      "groupSemantics",
      MODEL_LIST_GROUP_SEMANTICS.NOT_APPLICABLE,
    )
  })

  it("preserves stable group semantics when response capabilities downgrade", () => {
    const source = createAccountSource(createAccountFixture(SITE_TYPES.NEW_API))
    const downgradedSource = {
      ...source,
      capabilities: deriveModelListSourceCapabilities({
        capabilities: source.capabilities,
        modelListSource: { supportsPricing: false },
      }),
    }

    expect(downgradedSource.capabilities.supportsPricing).toBe(false)
    expect(downgradedSource.groupSemantics).toBe(
      MODEL_LIST_GROUP_SEMANTICS.ACCOUNT_OR_RUNTIME_KEY,
    )
  })

  it.each([SITE_TYPES.AIHUBMIX, SITE_TYPES.SHAREDCHAT])(
    "marks %s groups as not applicable before a response loads",
    (siteType) => {
      expect(
        createAccountSource(createAccountFixture(siteType)),
      ).toHaveProperty(
        "groupSemantics",
        MODEL_LIST_GROUP_SEMANTICS.NOT_APPLICABLE,
      )
    },
  )

  it.each([SITE_TYPES.SUB2API, SITE_TYPES.VO_API_V2])(
    "keeps %s account-or-runtime-key semantics before a model-list response loads",
    (siteType) => {
      expect(
        createAccountSource(createAccountFixture(siteType)),
      ).toHaveProperty(
        "groupSemantics",
        MODEL_LIST_GROUP_SEMANTICS.ACCOUNT_OR_RUNTIME_KEY,
      )
    },
  )
})
