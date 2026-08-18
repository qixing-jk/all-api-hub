import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { useKeyCredentialAssociations } from "~/features/KeyManagement/hooks/useKeyCredentialAssociations"
import { ACCOUNT_RUNTIME_KEY_SOURCES } from "~/services/accounts/accountRuntimeKeys"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import {
  API_CREDENTIAL_PROFILE_LINK_SOURCES,
  API_CREDENTIAL_PROFILE_LINK_STATES,
  type ApiCredentialProfile,
  type ApiCredentialProfileLink,
} from "~/types/apiCredentialProfiles"

const { linkMock, relinkMock, toastErrorMock, toastSuccessMock, unlinkMock } =
  vi.hoisted(() => ({
    linkMock: vi.fn(),
    relinkMock: vi.fn(),
    toastErrorMock: vi.fn(),
    toastSuccessMock: vi.fn(),
    unlinkMock: vi.fn(),
  }))

vi.mock("react-hot-toast", () => ({
  default: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}))

vi.mock("~/services/apiCredentialProfiles/apiCredentialProfileLinks", () => ({
  apiCredentialProfileLinks: {
    link: linkMock,
    relink: relinkMock,
    unlink: unlinkMock,
  },
}))

const locator = {
  source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountToken,
  accountId: "account-example",
  siteType: SITE_TYPES.NEW_API,
  tokenId: 7,
} as const

const otherLocator = {
  ...locator,
  tokenId: 8,
}

const profile = {
  id: "profile-example",
  name: "Example profile",
  apiType: API_TYPES.OPENAI_COMPATIBLE,
  baseUrl: "https://api.example.invalid",
  apiKey: "sk-example-secret",
  tagIds: [],
  notes: "",
  createdAt: 1,
  updatedAt: 1,
} satisfies ApiCredentialProfile

const link = {
  id: "link-example",
  profileId: profile.id,
  locator,
  state: API_CREDENTIAL_PROFILE_LINK_STATES.Active,
  linkedBy: API_CREDENTIAL_PROFILE_LINK_SOURCES.User,
  createdAt: 1,
  updatedAt: 1,
} satisfies ApiCredentialProfileLink

describe("useKeyCredentialAssociations", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    linkMock.mockResolvedValue(link)
    relinkMock.mockResolvedValue(link)
    unlinkMock.mockResolvedValue(true)
  })

  it("opens and closes the picker while resolving existing profile names", () => {
    const { result } = renderHook(() =>
      useKeyCredentialAssociations({
        links: [link, { ...link, id: "missing-profile", profileId: "missing" }],
        profiles: [profile],
        reloadLinks: vi.fn(),
      }),
    )

    act(() => result.current.openPicker(locator, "Example key", "secret"))

    expect(result.current.pickerTarget).toEqual({
      locator,
      displayLabel: "Example key",
      targetSecret: "secret",
    })
    expect(result.current.existingProfileNames).toEqual([
      profile.name,
      "missing",
    ])

    act(() => result.current.closePicker())
    expect(result.current.pickerTarget).toBeNull()
    expect(result.current.existingProfileNames).toEqual([])
  })

  it("creates a new association and keeps the picker locked while saving", async () => {
    let resolveLink!: (value: ApiCredentialProfileLink) => void
    linkMock.mockReturnValueOnce(
      new Promise<ApiCredentialProfileLink>((resolve) => {
        resolveLink = resolve
      }),
    )
    const reloadLinks = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() =>
      useKeyCredentialAssociations({
        links: [],
        profiles: [profile],
        reloadLinks,
      }),
    )
    act(() => result.current.openPicker(locator))

    let associationPromise!: Promise<void>
    act(() => {
      associationPromise = result.current.associate(profile.id)
    })
    expect(result.current.isAssociating).toBe(true)

    act(() => result.current.closePicker())
    expect(result.current.pickerTarget).not.toBeNull()

    await act(async () => {
      resolveLink(link)
      await associationPromise
    })

    expect(linkMock).toHaveBeenCalledWith({
      profileId: profile.id,
      locator,
      linkedBy: API_CREDENTIAL_PROFILE_LINK_SOURCES.User,
    })
    expect(reloadLinks).toHaveBeenCalledOnce()
    expect(toastSuccessMock).toHaveBeenCalledOnce()
    expect(result.current.pickerTarget).toBeNull()
    expect(result.current.isAssociating).toBe(false)
  })

  it("relinks an existing association and reports save failures", async () => {
    const reloadLinks = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() =>
      useKeyCredentialAssociations({
        links: [link],
        profiles: [profile],
        reloadLinks,
      }),
    )

    act(() => result.current.openPicker(locator))
    await act(() => result.current.associate("replacement-profile"))

    expect(relinkMock).toHaveBeenCalledWith({
      id: link.id,
      profileId: "replacement-profile",
      locator,
      linkedBy: API_CREDENTIAL_PROFILE_LINK_SOURCES.User,
    })

    relinkMock.mockRejectedValueOnce(new Error("storage unavailable"))
    act(() => result.current.openPicker(locator))
    await act(() => result.current.associate("failed-profile"))

    expect(toastErrorMock).toHaveBeenCalledOnce()
    expect(result.current.pickerTarget).not.toBeNull()
    expect(result.current.isAssociating).toBe(false)
  })

  it("unlinks only persisted removals and resolves linked profiles", async () => {
    const reloadLinks = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() =>
      useKeyCredentialAssociations({
        links: [link],
        profiles: [profile],
        reloadLinks,
      }),
    )

    expect(result.current.getProfileForLocator(locator)).toBe(profile)
    expect(result.current.getProfileForLocator(otherLocator)).toBeUndefined()

    unlinkMock.mockResolvedValueOnce(false)
    await act(() => result.current.unlink(link.id))
    expect(reloadLinks).not.toHaveBeenCalled()

    unlinkMock.mockResolvedValueOnce(true)
    await act(() => result.current.unlink(link.id))
    expect(reloadLinks).toHaveBeenCalledOnce()
    expect(toastSuccessMock).toHaveBeenCalledOnce()

    unlinkMock.mockRejectedValueOnce(new Error("storage unavailable"))
    await act(() => result.current.unlink(link.id))
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledOnce())
  })
})
