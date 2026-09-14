import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  buildAccountKeyResourceRuntimeKey,
  buildDisplayAccountTokenRuntimeKey,
  isAccountRuntimeKeyCompatibleWithModel,
} from "~/services/accounts/accountRuntimeKeys"
import { projectLegacyTokenModelAccess } from "~/services/accountTokens/tokenModelAccess"
import { AuthTypeEnum, type ApiToken } from "~/types"
import { buildApiToken } from "~~/tests/test-utils/factories"

const account = {
  id: "account-1",
  name: "Account",
  siteType: SITE_TYPES.NEW_API,
  baseUrl: "https://example.invalid",
  authType: AuthTypeEnum.AccessToken,
  token: "access-token",
  userId: "1",
}

describe("runtime key model access", () => {
  it.each<{
    name: string
    token: Partial<ApiToken>
    groups?: string[] | null
    compatible: boolean
  }>([
    { name: "unrestricted", token: {}, groups: ["default"], compatible: true },
    {
      name: "allowed model",
      token: { model_limits_enabled: true, model_limits: "gpt-4,gpt-3.5" },
      compatible: true,
    },
    {
      name: "denied model",
      token: { model_limits_enabled: true, model_limits: "gpt-3.5" },
      compatible: false,
    },
    { name: "disabled key", token: { status: 0 }, compatible: false },
    {
      name: "models takes precedence",
      token: {
        models: "gpt-4",
        model_limits_enabled: true,
        model_limits: "claude",
      },
      compatible: true,
    },
    {
      name: "models constrains disabled limits",
      token: { models: "claude", model_limits_enabled: false },
      compatible: false,
    },
    {
      name: "empty enabled allow-list",
      token: { model_limits_enabled: true, model_limits: " , " },
      compatible: false,
    },
    {
      name: "group mismatch",
      token: { group: "vip" },
      groups: ["default"],
      compatible: false,
    },
    {
      name: "unavailable model groups",
      token: { group: "vip" },
      groups: null,
      compatible: true,
    },
    { name: "explicit empty groups", token: {}, groups: [], compatible: false },
    {
      name: "empty group means default",
      token: { group: "" },
      groups: ["default"],
      compatible: true,
    },
    {
      name: "model group whitespace",
      token: { group: "default" },
      groups: [" "],
      compatible: true,
    },
  ])("preserves $name semantics", ({ token, groups, compatible }) => {
    const key = buildDisplayAccountTokenRuntimeKey(
      account,
      buildApiToken({
        status: 1,
        group: "default",
        models: "",
        model_limits_enabled: false,
        model_limits: "",
        ...token,
      }),
    )
    expect(
      isAccountRuntimeKeyCompatibleWithModel(key, {
        id: " gpt-4 ",
        enableGroups: groups,
      }),
    ).toBe(compatible)
    expect(isAccountRuntimeKeyCompatibleWithModel(key, { id: " " })).toBe(false)
  })

  it("keeps hints separate from restrictions and preserves all selectable candidates", () => {
    expect(
      projectLegacyTokenModelAccess({
        models: " gpt-4 , gpt-4, gpt-3.5 ",
        model_limits: "claude\ngpt-4 other",
        model_limits_enabled: false,
      }),
    ).toEqual({
      groups: ["default"],
      allowedModelIds: ["gpt-4", "gpt-3.5"],
      suggestedModelIds: ["gpt-4", "gpt-3.5", "claude", "other"],
    })
    expect(
      projectLegacyTokenModelAccess({
        models: " ",
        model_limits: "claude other",
      }),
    ).toMatchObject({
      allowedModelIds: null,
      suggestedModelIds: ["claude", "other"],
    })
    expect(projectLegacyTokenModelAccess({})).toMatchObject({
      allowedModelIds: null,
      suggestedModelIds: [],
    })
  })

  it("applies native resource restrictions without a token projection", () => {
    const key = buildAccountKeyResourceRuntimeKey(account, {
      ref: {
        accountId: account.id,
        siteType: account.siteType,
        scopeKey: "default",
        resourceId: "opaque-key",
      },
      label: "Native key",
      secret: "sk-native",
      modelAccess: {
        groups: ["vip"],
        allowedModelIds: ["gpt-4"],
        suggestedModelIds: ["gpt-4"],
      },
    })
    expect(
      isAccountRuntimeKeyCompatibleWithModel(key, {
        id: "gpt-4",
        enableGroups: ["vip"],
      }),
    ).toBe(true)
    expect(
      isAccountRuntimeKeyCompatibleWithModel(key, {
        id: "gpt-4",
        enableGroups: ["default"],
      }),
    ).toBe(false)
    expect(
      isAccountRuntimeKeyCompatibleWithModel(key, {
        id: "claude",
        enableGroups: ["vip"],
      }),
    ).toBe(false)
    expect(
      isAccountRuntimeKeyCompatibleWithModel(
        { ...key, status: "inactive" },
        { id: "gpt-4" },
      ),
    ).toBe(false)
  })
})
