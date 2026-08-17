import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  ACCOUNT_RUNTIME_KEY_SOURCES,
  type AccountRuntimeKeyLocator,
} from "~/services/accounts/accountRuntimeKeys"
import {
  ASSOCIATED_PROFILE_SECRET_RESOLUTION_STATUSES,
  resolveAssociatedProfileSecret,
} from "~/services/apiCredentialProfiles/accountRuntimeKeyRecovery"
import { API_CREDENTIAL_PROFILE_LINK_RESOLUTION_STATUSES } from "~/services/apiCredentialProfiles/apiCredentialProfileLinkContracts"
import { apiCredentialProfileLinks } from "~/services/apiCredentialProfiles/apiCredentialProfileLinks"
import { API_TYPES } from "~/services/verification/aiApiVerification"

vi.mock("~/services/apiCredentialProfiles/apiCredentialProfileLinks", () => ({
  apiCredentialProfileLinks: { resolve: vi.fn() },
}))

const locator: AccountRuntimeKeyLocator = {
  source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountKeyResource,
  ref: {
    accountId: "account-example",
    siteType: "openrouter",
    scopeKey: "workspace-example",
    resourceId: "resource-example",
  },
}

const profile = {
  id: "profile-example",
  name: "Example credential",
  apiType: API_TYPES.OPENAI_COMPATIBLE,
  baseUrl: "https://api.example.invalid/v1",
  apiKey: "secret-example",
  tagIds: [],
  notes: "",
  createdAt: 1,
  updatedAt: 1,
}

describe("resolveAssociatedProfileSecret", () => {
  beforeEach(() => {
    vi.mocked(apiCredentialProfileLinks.resolve).mockReset()
  })

  it("returns the locally stored secret for one resolved exact association", async () => {
    vi.mocked(apiCredentialProfileLinks.resolve).mockResolvedValue({
      status: API_CREDENTIAL_PROFILE_LINK_RESOLUTION_STATUSES.Resolved,
      link: {} as never,
      profile,
    })

    await expect(resolveAssociatedProfileSecret(locator)).resolves.toEqual({
      status: ASSOCIATED_PROFILE_SECRET_RESOLUTION_STATUSES.Resolved,
      profile,
      secret: "secret-example",
    })
    expect(apiCredentialProfileLinks.resolve).toHaveBeenCalledWith(locator)
  })

  it.each([
    API_CREDENTIAL_PROFILE_LINK_RESOLUTION_STATUSES.NotFound,
    API_CREDENTIAL_PROFILE_LINK_RESOLUTION_STATUSES.Stale,
    API_CREDENTIAL_PROFILE_LINK_RESOLUTION_STATUSES.NeedsConfirmation,
    API_CREDENTIAL_PROFILE_LINK_RESOLUTION_STATUSES.Ambiguous,
  ] as const)(
    "preserves the fail-closed %s association state",
    async (status) => {
      vi.mocked(apiCredentialProfileLinks.resolve).mockResolvedValue(
        status ===
          API_CREDENTIAL_PROFILE_LINK_RESOLUTION_STATUSES.NeedsConfirmation ||
          status === API_CREDENTIAL_PROFILE_LINK_RESOLUTION_STATUSES.Ambiguous
          ? { status, links: [] }
          : { status },
      )

      await expect(resolveAssociatedProfileSecret(locator)).resolves.toEqual({
        status,
      })
    },
  )

  it("rejects an associated profile whose stored secret is empty", async () => {
    vi.mocked(apiCredentialProfileLinks.resolve).mockResolvedValue({
      status: API_CREDENTIAL_PROFILE_LINK_RESOLUTION_STATUSES.Resolved,
      link: {} as never,
      profile: { ...profile, apiKey: "  " },
    })

    await expect(resolveAssociatedProfileSecret(locator)).resolves.toEqual({
      status: ASSOCIATED_PROFILE_SECRET_RESOLUTION_STATUSES.EmptySecret,
    })
  })
})
