import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  buildDisplayAccountTokenRuntimeKey,
  buildServiceCredentialRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import {
  buildManagedSiteChannelDraftSource,
  buildManagedSiteCredentialDraftSource,
} from "~/services/managedSites/channelDraftSource"
import {
  buildApiToken,
  buildDisplaySiteData,
} from "~~/tests/test-utils/factories"

describe("managed-site channel draft sources", () => {
  it("uses a service credential's API endpoint and secret without token metadata", () => {
    const account = buildDisplaySiteData({
      id: "sharedchat-account",
      name: "SharedChat",
      siteType: SITE_TYPES.SHAREDCHAT,
      baseUrl: "https://dashboard.example.invalid",
    })
    const runtimeKey = buildServiceCredentialRuntimeKey(account, {
      kind: "singleton_service_key",
      service: "codex",
      label: "Codex API Key",
      key: "test-service-key",
      baseUrl: "https://runtime.example.invalid/api/v1",
      isAuthenticated: true,
    })

    expect(buildManagedSiteChannelDraftSource(runtimeKey)).toEqual({
      name: "SharedChat | Codex API Key (auto)",
      baseUrl: "https://runtime.example.invalid/api/v1",
      apiKey: "test-service-key",
      modelHints: [],
    })
  })

  it("preserves token model hints and uses the account's canonical API origin", () => {
    const account = buildDisplaySiteData({
      name: "AIHubMix",
      siteType: SITE_TYPES.AIHUBMIX,
      baseUrl: "https://console.aihubmix.com",
    })
    const runtimeKey = buildDisplayAccountTokenRuntimeKey(
      account,
      buildApiToken({
        name: "Primary (auto)",
        key: "sk-********",
        models: "gpt-4o,claude-sonnet-4",
      }),
    )

    expect(
      buildManagedSiteChannelDraftSource({
        ...runtimeKey,
        secret: "test-resolved-key",
      }),
    ).toEqual({
      name: "AIHubMix | Primary (auto)",
      baseUrl: "https://aihubmix.com",
      apiKey: "test-resolved-key",
      modelHints: ["gpt-4o", "claude-sonnet-4"],
    })
  })

  it("prepares raw credential profiles without inventing an account or token", () => {
    expect(
      buildManagedSiteCredentialDraftSource({
        name: "Local gateway",
        baseUrl: " http://192.168.1.9:3000/api/v1 ",
        apiKey: "test-profile-key",
      }),
    ).toEqual({
      name: "Local gateway | Local gateway (auto)",
      baseUrl: "http://192.168.1.9:3000/api/v1",
      apiKey: "test-profile-key",
      modelHints: [],
    })
  })

  it("preserves an explicit credential URL even when its host matches an account profile", () => {
    expect(
      buildManagedSiteCredentialDraftSource({
        name: "Custom endpoint",
        baseUrl: " https://console.aihubmix.com/custom/v1 ",
        apiKey: "test-profile-key",
      }),
    ).toMatchObject({
      baseUrl: "https://console.aihubmix.com/custom/v1",
      apiKey: "test-profile-key",
    })
  })
})
