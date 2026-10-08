import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { buildAccountKeyResourceLinkedCleanupInput } from "~/services/accounts/keys/accountKeyResourceCleanup"
import { resolveAssociatedProfileSecret } from "~/services/apiCredentialProfiles/accountImport/accountRuntimeKeyRecovery"

vi.mock(
  "~/services/apiCredentialProfiles/accountImport/accountRuntimeKeyRecovery",
  () => ({
    ASSOCIATED_PROFILE_SECRET_RESOLUTION_STATUSES: {
      Resolved: "resolved",
    },
    resolveAssociatedProfileSecret: vi.fn(),
  }),
)

const account = {
  id: "account-1",
  siteType: SITE_TYPES.KIMI,
  baseUrl: "https://platform.kimi.com",
}
const ref = {
  accountId: account.id,
  siteType: account.siteType,
  scopeKey: "project-1",
  resourceId: "key-1",
}

describe("account key resource linked cleanup input", () => {
  beforeEach(() => vi.resetAllMocks())

  it("uses an active associated credential and its gateway URL when the provider cannot reveal the key", async () => {
    vi.mocked(resolveAssociatedProfileSecret).mockResolvedValue({
      status: "resolved",
      secret: "sk-stored",
      profile: { baseUrl: "https://api.moonshot.cn/v1" },
    } as Awaited<ReturnType<typeof resolveAssociatedProfileSecret>>)

    const resolveProvider = vi.fn(async () => ({
      kind: "unavailable" as const,
    }))
    await expect(
      buildAccountKeyResourceLinkedCleanupInput({
        account,
        ref,
        resolveProvider,
      }),
    ).resolves.toEqual({
      source: {
        accountId: account.id,
        accountBaseUrl: account.baseUrl,
        ref,
      },
      baseUrl: "https://api.moonshot.cn",
      key: "sk-stored",
    })
    expect(resolveProvider).not.toHaveBeenCalled()
  })

  it("uses a recoverable key's own channel endpoint", async () => {
    const rightCodeAccount = {
      id: "rightcode-account",
      siteType: SITE_TYPES.RIGHT_CODE,
      baseUrl: "https://www.right.codes",
    }
    const rightCodeRef = {
      accountId: rightCodeAccount.id,
      siteType: rightCodeAccount.siteType,
      scopeKey: "account",
      resourceId: "12",
    }
    const resolveProvider = vi.fn(async () => ({
      kind: "resolved" as const,
      secret: "sk-channel-key",
    }))

    await expect(
      buildAccountKeyResourceLinkedCleanupInput({
        account: rightCodeAccount,
        ref: rightCodeRef,
        runtimeKeyBaseUrl: "https://channel.example.invalid/v1",
        resolveProvider,
      }),
    ).resolves.toMatchObject({
      baseUrl: "https://channel.example.invalid",
      key: "sk-channel-key",
    })
    expect(resolveProvider).toHaveBeenCalledOnce()
    expect(resolveAssociatedProfileSecret).not.toHaveBeenCalled()
  })

  it("keeps the provider's key endpoint when recovery supplies a different profile address", async () => {
    vi.mocked(resolveAssociatedProfileSecret).mockResolvedValue({
      status: "resolved",
      secret: "sk-stored",
      profile: { baseUrl: "https://old-gateway.example/v1" },
    } as Awaited<ReturnType<typeof resolveAssociatedProfileSecret>>)
    await expect(
      buildAccountKeyResourceLinkedCleanupInput({
        account,
        ref,
        runtimeKeyBaseUrl: "https://api.moonshot.cn/v1",
        resolveProvider: vi.fn(),
      }),
    ).resolves.toMatchObject({
      baseUrl: "https://api.moonshot.cn",
      key: "sk-stored",
    })
  })
})
