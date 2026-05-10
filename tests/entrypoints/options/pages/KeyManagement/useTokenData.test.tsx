import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useTokenData } from "~/features/KeyManagement/components/AddTokenDialog/hooks/useTokenData"
import { API_ERROR_CODES, ApiError } from "~/services/apiService/common/errors"
import { AuthTypeEnum } from "~/types"
import { renderHook, waitFor } from "~~/tests/test-utils/render"

const {
  createDisplayAccountApiContextMock,
  fetchAccountAvailableModelsMock,
  fetchUserGroupsMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  createDisplayAccountApiContextMock: vi.fn(),
  fetchAccountAvailableModelsMock: vi.fn(),
  fetchUserGroupsMock: vi.fn(),
  toastErrorMock: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    error: toastErrorMock,
  },
}))

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>()
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => `keyManagement:${key}`,
    }),
  }
})

vi.mock("~/services/accounts/utils/apiServiceRequest", () => ({
  createDisplayAccountApiContext: (...args: any[]) =>
    createDisplayAccountApiContextMock(...args),
}))

const ACCOUNT = {
  id: "acc-1",
  name: "Example",
  username: "tester",
  siteType: "new-api",
  baseUrl: "https://example.com",
  token: "token",
  userId: 1,
  authType: AuthTypeEnum.AccessToken,
  checkIn: { enableDetection: false },
} as any

const createGroups = (keys: string[]) =>
  Object.fromEntries(
    keys.map((key, index) => [key, { desc: `${key} group`, ratio: index + 1 }]),
  )

type RenderSubjectProps = {
  isOpen: boolean
  currentAccount?: typeof ACCOUNT
  initialGroup?: string
  allowedGroups?: string[]
}

const renderSubject = (props: RenderSubjectProps) =>
  renderHook(
    ({
      isOpen,
      currentAccount,
      initialGroup = "",
      allowedGroups,
    }: RenderSubjectProps) => {
      const [formData, setFormData] = useState({
        group: initialGroup,
      } as any)

      return {
        formData,
        ...useTokenData(isOpen, currentAccount, setFormData, allowedGroups),
      }
    },
    {
      initialProps: props,
    },
  )

describe("useTokenData", () => {
  beforeEach(() => {
    createDisplayAccountApiContextMock.mockReset()
    fetchAccountAvailableModelsMock.mockReset()
    fetchUserGroupsMock.mockReset()
    toastErrorMock.mockReset()

    createDisplayAccountApiContextMock.mockReturnValue({
      service: {
        fetchAccountAvailableModels: fetchAccountAvailableModelsMock,
        fetchUserGroups: fetchUserGroupsMock,
      },
      request: { accountId: ACCOUNT.id },
    })
  })

  it("waits until the dialog is open before loading bootstrap data", async () => {
    fetchAccountAvailableModelsMock.mockResolvedValue(["gpt-4o-mini"])
    fetchUserGroupsMock.mockResolvedValue(createGroups(["default"]))

    const { result, rerender } = renderSubject({
      isOpen: false,
      currentAccount: ACCOUNT,
      initialGroup: "",
    })

    expect(fetchAccountAvailableModelsMock).not.toHaveBeenCalled()
    expect(fetchUserGroupsMock).not.toHaveBeenCalled()

    rerender({
      isOpen: true,
      currentAccount: ACCOUNT,
      initialGroup: "",
    })

    await waitFor(() => {
      expect(result.current.availableModels).toEqual(["gpt-4o-mini"])
    })

    expect(createDisplayAccountApiContextMock).toHaveBeenCalledWith(ACCOUNT)
    expect(fetchUserGroupsMock).toHaveBeenCalled()
  })

  it("keeps an already-eligible group selection when restricted groups still allow it", async () => {
    fetchAccountAvailableModelsMock.mockResolvedValue(["gpt-4o-mini"])
    fetchUserGroupsMock.mockResolvedValue(createGroups(["default", "vip"]))

    const { result } = renderSubject({
      isOpen: true,
      currentAccount: ACCOUNT,
      initialGroup: "vip",
      allowedGroups: [" vip ", "default"],
    })

    await waitFor(() => {
      expect(result.current.groups).toMatchObject(
        createGroups(["default", "vip"]),
      )
    })

    expect(result.current.formData.group).toBe("vip")
  })

  it("keeps the group blank when restricted groups require a manual choice", async () => {
    fetchAccountAvailableModelsMock.mockResolvedValue(["gpt-4o-mini"])
    fetchUserGroupsMock.mockResolvedValue(createGroups(["default", "vip"]))

    const { result } = renderSubject({
      isOpen: true,
      currentAccount: ACCOUNT,
      initialGroup: "",
      allowedGroups: ["vip"],
    })

    await waitFor(() => {
      expect(result.current.availableModels).toEqual(["gpt-4o-mini"])
    })

    expect(result.current.formData.group).toBe("")
  })

  it("leaves an invalid restricted group unchanged when no fallback group is available", async () => {
    fetchAccountAvailableModelsMock.mockResolvedValue(["gpt-4o-mini"])
    fetchUserGroupsMock.mockResolvedValue(createGroups(["default"]))

    const { result } = renderSubject({
      isOpen: true,
      currentAccount: ACCOUNT,
      initialGroup: "legacy",
      allowedGroups: ["vip"],
    })

    await waitFor(() => {
      expect(result.current.availableModels).toEqual(["gpt-4o-mini"])
    })

    expect(result.current.formData.group).toBe("legacy")
  })

  it("falls back to the default group when the current group is no longer allowed", async () => {
    fetchAccountAvailableModelsMock.mockResolvedValue(["gpt-4o-mini"])
    fetchUserGroupsMock.mockResolvedValue(createGroups(["default", "vip"]))

    const { result } = renderSubject({
      isOpen: true,
      currentAccount: ACCOUNT,
      initialGroup: "legacy",
      allowedGroups: [" default ", "vip"],
    })

    await waitFor(() => {
      expect(result.current.formData.group).toBe("default")
    })
  })

  it("falls back to the first allowed available group when default is unavailable", async () => {
    fetchAccountAvailableModelsMock.mockResolvedValue(["gpt-4o-mini"])
    fetchUserGroupsMock.mockResolvedValue(createGroups(["pro", "vip"]))

    const { result } = renderSubject({
      isOpen: true,
      currentAccount: ACCOUNT,
      initialGroup: "legacy",
      allowedGroups: ["pro", "vip"],
    })

    await waitFor(() => {
      expect(result.current.formData.group).toBe("pro")
    })
  })

  it("falls back to the first fetched group when unrestricted groups have no default", async () => {
    fetchAccountAvailableModelsMock.mockResolvedValue(["gpt-4o-mini"])
    fetchUserGroupsMock.mockResolvedValue(createGroups(["beta", "alpha"]))

    const { result } = renderSubject({
      isOpen: true,
      currentAccount: ACCOUNT,
      initialGroup: "legacy",
    })

    await waitFor(() => {
      expect(result.current.formData.group).toBe("beta")
    })
  })

  it("treats unsupported group capability as no group selection without showing an error", async () => {
    fetchAccountAvailableModelsMock.mockResolvedValue(["gpt-4o-mini"])
    fetchUserGroupsMock.mockRejectedValue(
      new ApiError(
        "groups_unsupported",
        undefined,
        undefined,
        API_ERROR_CODES.FEATURE_UNSUPPORTED,
      ),
    )

    const { result } = renderSubject({
      isOpen: true,
      currentAccount: ACCOUNT,
      initialGroup: "default",
    })

    await waitFor(() => {
      expect(result.current.availableModels).toEqual(["gpt-4o-mini"])
    })

    expect(result.current.groups).toEqual({})
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it("shows the localized fallback error when loading bootstrap data fails without a message", async () => {
    fetchAccountAvailableModelsMock.mockRejectedValue("")
    fetchUserGroupsMock.mockResolvedValue(createGroups(["default"]))

    const { result } = renderSubject({
      isOpen: true,
      currentAccount: ACCOUNT,
      initialGroup: "default",
    })

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "keyManagement:dialog.loadDataFailed",
      )
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.availableModels).toEqual([])
    expect(result.current.groups).toEqual({})
  })
})
