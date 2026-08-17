import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  AIHUBMIX_API_ORIGIN,
  AIHUBMIX_WEB_ORIGIN,
  SITE_TYPES,
} from "~/constants/siteType"
import { createProfileFromAccountToken } from "~/services/apiCredentialProfiles/accountTokenImport"
import { API_TYPES } from "~/services/verification/aiApiVerification"

const { captureProfileMock } = vi.hoisted(() => ({
  captureProfileMock: vi.fn(),
}))

vi.mock("~/services/apiCredentialProfiles/apiCredentialProfileLinks", () => ({
  apiCredentialProfileLinks: {
    capture: (...args: unknown[]) => captureProfileMock(...args),
  },
}))

describe("createProfileFromAccountToken", () => {
  beforeEach(() => {
    captureProfileMock.mockReset()
  })

  it("creates a normalized OpenAI-compatible profile from an account token", async () => {
    captureProfileMock.mockResolvedValueOnce({
      status: "captured",
      profile: {
        id: "profile-1",
        name: "Example - Default API Key",
      },
    })

    const profile = await createProfileFromAccountToken({
      accountName: "  Example  ",
      fallbackAccountName: "Example",
      baseUrl: "https://api.example.invalid/v1",
      siteType: SITE_TYPES.NEW_API,
      tagIds: ["tag-a"],
      token: {
        key: "sk-example",
        name: "  Default API Key  ",
      },
    })

    expect(profile).toEqual({
      id: "profile-1",
      name: "Example - Default API Key",
    })
    expect(captureProfileMock).toHaveBeenCalledWith({
      profile: {
        name: "Example - Default API Key",
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: "https://api.example.invalid/v1",
        apiKey: "sk-example",
        tagIds: ["tag-a"],
      },
      linkedBy: "resolved-runtime-key",
    })
  })

  it("uses the AIHubMix API origin for web-console account tokens", async () => {
    captureProfileMock.mockResolvedValueOnce({
      status: "captured",
      profile: {
        id: "profile-1",
        name: "AIHubMix - Default API Key",
      },
    })

    await createProfileFromAccountToken({
      accountName: "AIHubMix",
      baseUrl: AIHUBMIX_WEB_ORIGIN,
      siteType: SITE_TYPES.AIHUBMIX,
      token: {
        key: "sk-aihubmix",
        name: "Default API Key",
      },
    })

    expect(captureProfileMock).toHaveBeenCalledWith({
      profile: {
        name: "AIHubMix - Default API Key",
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: AIHUBMIX_API_ORIGIN,
        apiKey: "sk-aihubmix",
        tagIds: [],
      },
      linkedBy: "resolved-runtime-key",
    })
  })

  it("forwards an exact account runtime key locator to the capture seam", async () => {
    captureProfileMock.mockResolvedValueOnce({
      status: "linked",
      profile: { id: "profile-1", name: "Example - Default API Key" },
    })
    const locator = {
      source: "account_token" as const,
      accountId: "account-example",
      siteType: SITE_TYPES.NEW_API,
      tokenId: 42,
    }

    await createProfileFromAccountToken({
      accountName: "Example",
      baseUrl: "https://api.example.invalid",
      siteType: SITE_TYPES.NEW_API,
      token: { key: "sk-example", name: "Default API Key" },
      locator,
      linkedBy: "creation-response",
    })

    expect(captureProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({ locator, linkedBy: "creation-response" }),
    )
  })
})
