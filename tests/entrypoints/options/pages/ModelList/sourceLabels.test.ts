import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  createAccountModelListSourceIdentity,
  createAccountRuntimeKeyModelListSourceIdentity,
  createAccountSource,
  createAccountTokenModelListSourceIdentity,
  createProfileSource,
  MODEL_LIST_SOURCE_IDENTITY_KINDS,
} from "~/features/ModelList/modelManagementSources"
import { formatModelListSourceLabel } from "~/features/ModelList/sourceLabels"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { AuthTypeEnum, SiteHealthStatus, type DisplaySiteData } from "~/types"

const createDisplayAccount = (
  overrides: Partial<DisplaySiteData>,
): DisplaySiteData => ({
  id: "account",
  name: "Account",
  username: "user",
  balance: { USD: 0, CNY: 0 },
  todayConsumption: { USD: 0, CNY: 0 },
  todayIncome: { USD: 0, CNY: 0 },
  todayTokens: { upload: 0, download: 0 },
  health: { status: SiteHealthStatus.Healthy },
  siteType: SITE_TYPES.UNKNOWN,
  baseUrl: "https://example.com",
  token: "token",
  userId: "1",
  authType: AuthTypeEnum.AccessToken,
  checkIn: { enableDetection: false },
  ...overrides,
})

const labelOptions = {
  formatProfileLabel: ({ name, host }: { name: string; host?: string }) =>
    host ? `${name} (${host})` : name,
}

describe("formatModelListSourceLabel", () => {
  it("creates account runtime-key source identity", () => {
    expect(
      createAccountRuntimeKeyModelListSourceIdentity({
        accountId: "account-1",
        runtimeKeyId: "service_credential:account-1:codex",
        runtimeKeyName: "Codex",
      }),
    ).toEqual({
      kind: MODEL_LIST_SOURCE_IDENTITY_KINDS.ACCOUNT_RUNTIME_KEY,
      id: "account-1:runtime-key:service_credential:account-1:codex",
      runtimeKeyId: "service_credential:account-1:codex",
      runtimeKeyName: "Codex",
    })
  })

  it("falls back to runtime-key ids when runtime-key source names are blank", () => {
    const account = createDisplayAccount({
      id: "sharedchat-account",
      name: "SharedChat Account",
      baseUrl: "https://sharedchat.example.invalid",
      siteType: SITE_TYPES.SHAREDCHAT,
    })

    expect(
      formatModelListSourceLabel(
        createAccountSource(account),
        labelOptions,
        createAccountRuntimeKeyModelListSourceIdentity({
          accountId: account.id,
          runtimeKeyId: "service_credential:sharedchat-account:codex",
          runtimeKeyName: "  ",
        }),
      ),
    ).toEqual({
      label:
        "SharedChat Account / service_credential:sharedchat-account:codex · sharedchat.example.invalid",
      title: "https://sharedchat.example.invalid",
    })
  })

  it("includes token names for account-token model-list sources", () => {
    const account = createDisplayAccount({
      id: "sub2api-account",
      name: "Sub2API Account",
      baseUrl: "https://sub2api.example.invalid",
      siteType: SITE_TYPES.SUB2API,
    })

    const label = formatModelListSourceLabel(
      createAccountSource(account),
      labelOptions,
      createAccountTokenModelListSourceIdentity({
        accountId: account.id,
        tokenId: 41,
        tokenName: "VIP runtime key",
      }),
    )

    expect(label).toEqual({
      label: "Sub2API Account / VIP runtime key · sub2api.example.invalid",
      title: "https://sub2api.example.invalid",
    })
    expect(label.label).not.toContain("sk-")
  })

  it("falls back to token ids when account-token source names are blank", () => {
    const account = createDisplayAccount({
      id: "sub2api-account",
      name: "Sub2API Account",
      baseUrl: "https://sub2api.example.invalid",
      siteType: SITE_TYPES.SUB2API,
    })

    expect(
      formatModelListSourceLabel(
        createAccountSource(account),
        labelOptions,
        createAccountTokenModelListSourceIdentity({
          accountId: account.id,
          tokenId: 42,
          tokenName: "  ",
        }),
      ),
    ).toEqual({
      label: "Sub2API Account / #42 · sub2api.example.invalid",
      title: "https://sub2api.example.invalid",
    })
  })

  it("ignores non-token source identities for account labels", () => {
    const account = createDisplayAccount({
      id: "sub2api-account",
      name: "Sub2API Account",
      baseUrl: "https://sub2api.example.invalid",
      siteType: SITE_TYPES.SUB2API,
    })

    expect(
      formatModelListSourceLabel(
        createAccountSource(account),
        labelOptions,
        createAccountModelListSourceIdentity(account.id),
      ),
    ).toEqual({
      label: "Sub2API Account · sub2api.example.invalid",
      title: "https://sub2api.example.invalid",
    })
  })

  it("keeps profile labels unchanged", () => {
    const source = createProfileSource({
      id: "profile",
      name: "Reusable Key",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://profile.example.invalid/v1",
      apiKey: "sk-secret",
      tagIds: [],
      notes: "",
      createdAt: 1,
      updatedAt: 1,
    })

    expect(formatModelListSourceLabel(source, labelOptions)).toEqual({
      label: "Reusable Key (profile.example.invalid)",
      title: "https://profile.example.invalid/v1",
    })
  })
})
