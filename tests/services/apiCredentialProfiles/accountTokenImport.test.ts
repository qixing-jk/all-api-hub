import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  AIHUBMIX_API_ORIGIN,
  AIHUBMIX_WEB_ORIGIN,
  SITE_TYPES,
} from "~/constants/siteType"
import { createProfileFromAccountToken } from "~/services/apiCredentialProfiles/accountTokenImport"
import { API_TYPES } from "~/services/verification/aiApiVerification"

const { createProfileMock } = vi.hoisted(() => ({
  createProfileMock: vi.fn(),
}))

vi.mock(
  "~/services/apiCredentialProfiles/apiCredentialProfilesStorage",
  () => ({
    apiCredentialProfilesStorage: {
      createProfile: (...args: unknown[]) => createProfileMock(...args),
    },
  }),
)

describe("createProfileFromAccountToken", () => {
  beforeEach(() => {
    createProfileMock.mockReset()
  })

  it("creates a normalized OpenAI-compatible profile from an account token", async () => {
    createProfileMock.mockResolvedValueOnce({
      id: "profile-1",
      name: "Example - Default API Key",
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
    expect(createProfileMock).toHaveBeenCalledWith({
      name: "Example - Default API Key",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://api.example.invalid/v1",
      apiKey: "sk-example",
      tagIds: ["tag-a"],
    })
  })

  it("uses the AIHubMix API origin for web-console account tokens", async () => {
    createProfileMock.mockResolvedValueOnce({
      id: "profile-1",
      name: "AIHubMix - Default API Key",
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

    expect(createProfileMock).toHaveBeenCalledWith({
      name: "AIHubMix - Default API Key",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: AIHUBMIX_API_ORIGIN,
      apiKey: "sk-aihubmix",
      tagIds: [],
    })
  })
})
