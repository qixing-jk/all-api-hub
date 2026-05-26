import type { TFunction } from "i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  AIHUBMIX_API_ORIGIN,
  AIHUBMIX_WEB_ORIGIN,
  SITE_TYPES,
} from "~/constants/siteType"
import { buildOneTimeApiKeyProfileSaveAction } from "~/features/KeyManagement/utils/apiCredentialProfileSaveAction"
import { API_TYPES } from "~/services/verification/aiApiVerification"

const { createApiCredentialProfileMock, toastSuccessMock } = vi.hoisted(() => ({
  createApiCredentialProfileMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    success: toastSuccessMock,
  },
}))

vi.mock(
  "~/services/apiCredentialProfiles/apiCredentialProfilesStorage",
  () => ({
    apiCredentialProfilesStorage: {
      createProfile: (...args: unknown[]) =>
        createApiCredentialProfileMock(...args),
    },
  }),
)

describe("buildOneTimeApiKeyProfileSaveAction", () => {
  beforeEach(() => {
    createApiCredentialProfileMock.mockReset()
    toastSuccessMock.mockReset()
  })

  it("uses the AIHubMix API origin when the source account was saved from the web console", async () => {
    createApiCredentialProfileMock.mockResolvedValueOnce({
      id: "profile-1",
      name: "AIHubMix - Default API Key",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: AIHUBMIX_API_ORIGIN,
      apiKey: "sk-one-time-full",
      tagIds: [],
      notes: "",
      createdAt: 1,
      updatedAt: 1,
    })
    const t = vi.fn((key: string) => key) as unknown as TFunction
    const logger = { error: vi.fn() }

    const saveAction = buildOneTimeApiKeyProfileSaveAction({
      accountName: "AIHubMix",
      baseUrl: AIHUBMIX_WEB_ORIGIN,
      siteType: SITE_TYPES.AIHUBMIX,
      token: {
        key: "sk-one-time-full",
        name: "Default API Key",
      },
      t,
      logger,
      source: "AddTokenDialog",
    })

    await saveAction.onSave()

    expect(createApiCredentialProfileMock).toHaveBeenCalledWith({
      name: "AIHubMix - Default API Key",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: AIHUBMIX_API_ORIGIN,
      apiKey: "sk-one-time-full",
      tagIds: [],
    })
  })

  it("keeps non-AIHubMix account base URLs unchanged", async () => {
    createApiCredentialProfileMock.mockResolvedValueOnce({
      id: "profile-1",
      name: "Example - Default API Key",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://api.example.com",
      apiKey: "sk-one-time-full",
      tagIds: [],
      notes: "",
      createdAt: 1,
      updatedAt: 1,
    })
    const t = vi.fn((key: string) => key) as unknown as TFunction
    const logger = { error: vi.fn() }

    const saveAction = buildOneTimeApiKeyProfileSaveAction({
      accountName: "Example",
      baseUrl: "https://api.example.com",
      siteType: SITE_TYPES.NEW_API,
      token: {
        key: "sk-one-time-full",
        name: "Default API Key",
      },
      t,
      logger,
      source: "AddTokenDialog",
    })

    await saveAction.onSave()

    expect(createApiCredentialProfileMock).toHaveBeenCalledWith({
      name: "Example - Default API Key",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://api.example.com",
      apiKey: "sk-one-time-full",
      tagIds: [],
    })
  })
})
