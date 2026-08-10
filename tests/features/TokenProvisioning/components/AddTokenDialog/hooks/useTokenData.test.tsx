import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  TOKEN_MODEL_DISCOVERY_TIMEOUT_MS,
  useTokenData,
} from "~/features/TokenProvisioning/components/AddTokenDialog/hooks/useTokenData"
import { DEFAULT_AUTO_PROVISION_TOKEN_NAME } from "~/services/accounts/defaultTokenLifecycle"
import { AuthTypeEnum } from "~/types"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

const {
  createDisplayAccountApiContextMock,
  fetchAccountAvailableModelsMock,
  fetchUserGroupsMock,
  toastErrorMock,
  translateMock,
} = vi.hoisted(() => ({
  createDisplayAccountApiContextMock: vi.fn(),
  fetchAccountAvailableModelsMock: vi.fn(),
  fetchUserGroupsMock: vi.fn(),
  toastErrorMock: vi.fn(),
  translateMock: vi.fn((key: string) => `keyManagement:${key}`),
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
      t: translateMock,
    }),
  }
})

vi.mock("~/services/accounts/utils/apiServiceRequest", () => ({
  createDisplayAccountApiContext: (...args: any[]) =>
    createDisplayAccountApiContextMock(...args),
  fetchDisplayAccountAvailableModels: (...args: any[]) =>
    fetchAccountAvailableModelsMock(...args),
  requireDisplayAccountKeyManagement: (
    _account: unknown,
    keyManagement: unknown,
  ) => keyManagement,
}))

const ACCOUNT = {
  id: "acc-1",
  name: "Example",
  username: "tester",
  siteType: SITE_TYPES.NEW_API,
  baseUrl: "https://example.com",
  token: "token",
  userId: "1",
  authType: AuthTypeEnum.AccessToken,
  checkIn: {
    automaticExecutionEnabled: false,
    methodKnowledge: { methods: {} },
    selection: { mode: "automatic" as const },
  },
} as any

const SERVICE_CREDENTIAL_ONLY_ACCOUNT = {
  ...ACCOUNT,
  id: "sharedchat-1",
  name: "SharedChat",
  siteType: SITE_TYPES.SHAREDCHAT,
  baseUrl: "https://sharedchat.example.invalid",
  token: "",
  authType: AuthTypeEnum.Cookie,
  cookieAuthSessionCookie: "session=abc",
}

const createGroups = (keys: string[]) =>
  Object.fromEntries(
    keys.map((key, index) => [key, { desc: `${key} group`, ratio: index + 1 }]),
  )

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}

type RenderSubjectProps = {
  isOpen: boolean
  currentAccount?: typeof ACCOUNT
  initialGroup?: string
  initialName?: string
  initialModelLimitsEnabled?: boolean
  initialModelLimits?: string[]
  allowedGroups?: string[]
  preserveExistingModelLimitsOnFailure?: boolean
}

const renderSubject = (props: RenderSubjectProps) =>
  renderHook(
    ({
      isOpen,
      currentAccount,
      initialGroup = "",
      initialName = "",
      initialModelLimitsEnabled = false,
      initialModelLimits = [],
      allowedGroups,
      preserveExistingModelLimitsOnFailure = false,
    }: RenderSubjectProps) => {
      const [formData, setFormData] = useState({
        group: initialGroup,
        name: initialName,
        modelLimitsEnabled: initialModelLimitsEnabled,
        modelLimits: initialModelLimits,
      } as any)

      return {
        formData,
        ...useTokenData(
          isOpen,
          currentAccount,
          setFormData,
          allowedGroups,
          preserveExistingModelLimitsOnFailure,
        ),
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
      keyManagement: {
        fetchAvailableModels: fetchAccountAvailableModelsMock,
        userGroups: {
          fetch: fetchUserGroupsMock,
        },
      },
      request: { accountId: ACCOUNT.id },
    })
  })

  it("waits until the dialog is open before loading required bootstrap data", async () => {
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
      expect(result.current.groups).toEqual(createGroups(["default"]))
    })

    expect(createDisplayAccountApiContextMock).toHaveBeenCalledWith(ACCOUNT)
    expect(fetchUserGroupsMock).toHaveBeenCalled()
    expect(fetchAccountAvailableModelsMock).not.toHaveBeenCalled()
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
      expect(result.current.groups).toEqual(createGroups(["default", "vip"]))
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
      expect(result.current.groups).toEqual(createGroups(["default"]))
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

  it("keeps the default auto token name aligned with the fetched fallback group", async () => {
    fetchAccountAvailableModelsMock.mockResolvedValue(["gpt-4o-mini"])
    fetchUserGroupsMock.mockResolvedValue(createGroups(["beta", "alpha"]))

    const { result } = renderSubject({
      isOpen: true,
      currentAccount: ACCOUNT,
      initialGroup: "default",
      initialName: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
    })

    await waitFor(() => {
      expect(result.current.formData.group).toBe("beta")
    })

    expect(result.current.formData.name).toBe("beta group (auto)")
  })

  it("treats missing group capability as no group selection without showing an error", async () => {
    fetchAccountAvailableModelsMock.mockResolvedValue(["gpt-4o-mini"])
    createDisplayAccountApiContextMock.mockReturnValue({
      keyManagement: {
        fetchAvailableModels: fetchAccountAvailableModelsMock,
      },
      request: { accountId: ACCOUNT.id },
    })

    const { result } = renderSubject({
      isOpen: true,
      currentAccount: ACCOUNT,
      initialGroup: "default",
    })

    await waitFor(() => {
      expect(createDisplayAccountApiContextMock).toHaveBeenCalledWith(ACCOUNT)
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.groups).toEqual({})
    expect(fetchAccountAvailableModelsMock).not.toHaveBeenCalled()
    expect(fetchUserGroupsMock).not.toHaveBeenCalled()
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it("does not load token metadata for service-credential-only accounts", async () => {
    createDisplayAccountApiContextMock.mockReturnValue({
      serviceCredential: {
        fetch: vi.fn(),
        rotate: vi.fn(),
      },
      request: { accountId: SERVICE_CREDENTIAL_ONLY_ACCOUNT.id },
    })

    const { result } = renderSubject({
      isOpen: true,
      currentAccount: SERVICE_CREDENTIAL_ONLY_ACCOUNT,
      initialGroup: "default",
    })

    await waitFor(() => {
      expect(createDisplayAccountApiContextMock).not.toHaveBeenCalled()
      expect(result.current.isLoading).toBe(false)
    })

    expect(fetchAccountAvailableModelsMock).not.toHaveBeenCalled()
    expect(fetchUserGroupsMock).not.toHaveBeenCalled()
    expect(result.current.availableModels).toEqual([])
    expect(result.current.groups).toEqual({})
    expect(result.current.formData.group).toBe("default")
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it("contains an on-demand model lookup failure without clearing groups", async () => {
    fetchAccountAvailableModelsMock.mockRejectedValue(
      new Error("model lookup forbidden"),
    )
    fetchUserGroupsMock.mockResolvedValue(createGroups(["default"]))

    const { result } = renderSubject({
      isOpen: true,
      currentAccount: ACCOUNT,
      initialGroup: "default",
    })

    await waitFor(() => {
      expect(result.current.groups).toEqual(createGroups(["default"]))
    })

    await act(async () => {
      await expect(result.current.loadAvailableModels()).resolves.toBe(false)
    })

    expect(result.current.groups).toEqual(createGroups(["default"]))
    expect(result.current.availableModels).toEqual([])
    expect(result.current.isModelsLoading).toBe(false)
    expect(result.current.modelLoadErrorMessage).toBe(
      "keyManagement:dialog.modelLoadFailed",
    )
    expect(toastErrorMock).toHaveBeenCalledWith(
      "keyManagement:dialog.modelLoadFailed",
    )
    expect(fetchAccountAvailableModelsMock).toHaveBeenCalledWith(
      ACCOUNT,
      expect.objectContaining({
        abortSignal: expect.any(AbortSignal),
        requestTimeoutMs: TOKEN_MODEL_DISCOVERY_TIMEOUT_MS,
      }),
    )
  })

  it("disables and clears prefilled model limits when discovery fails for create", async () => {
    fetchAccountAvailableModelsMock.mockRejectedValue(
      new Error("model lookup forbidden"),
    )
    fetchUserGroupsMock.mockResolvedValue(createGroups(["default"]))

    const { result } = renderSubject({
      isOpen: true,
      currentAccount: ACCOUNT,
      initialGroup: "default",
      initialModelLimitsEnabled: true,
      initialModelLimits: ["prefilled-model"],
    })

    await waitFor(() => {
      expect(result.current.groups).toEqual(createGroups(["default"]))
    })

    await act(async () => {
      await expect(result.current.loadAvailableModels()).resolves.toBe(false)
    })

    expect(result.current.formData).toMatchObject({
      modelLimitsEnabled: false,
      modelLimits: [],
    })
  })

  it("preserves existing model limits when discovery fails during edit", async () => {
    fetchAccountAvailableModelsMock.mockRejectedValue(
      new Error("model lookup forbidden"),
    )
    fetchUserGroupsMock.mockResolvedValue(createGroups(["default"]))

    const { result } = renderSubject({
      isOpen: true,
      currentAccount: ACCOUNT,
      initialGroup: "default",
      initialModelLimitsEnabled: true,
      initialModelLimits: ["existing-model"],
      preserveExistingModelLimitsOnFailure: true,
    })

    await waitFor(() => {
      expect(result.current.groups).toEqual(createGroups(["default"]))
    })

    await act(async () => {
      await expect(result.current.loadAvailableModels()).resolves.toBe(false)
    })

    expect(result.current.formData).toMatchObject({
      modelLimitsEnabled: true,
      modelLimits: ["existing-model"],
    })
  })

  it.each([
    ["a non-array payload", { data: ["example-model"] }],
    ["a payload containing non-string models", ["example-model", 42]],
  ])("rejects %s from model discovery", async (_label, payload) => {
    fetchAccountAvailableModelsMock.mockResolvedValue(payload)
    fetchUserGroupsMock.mockResolvedValue(createGroups(["default"]))

    const { result } = renderSubject({
      isOpen: true,
      currentAccount: ACCOUNT,
      initialGroup: "default",
    })

    await waitFor(() => {
      expect(result.current.groups).toEqual(createGroups(["default"]))
    })

    await act(async () => {
      await expect(result.current.loadAvailableModels()).resolves.toBe(false)
    })

    expect(result.current.availableModels).toEqual([])
    expect(result.current.modelLoadErrorMessage).toBe(
      "keyManagement:dialog.modelLoadFailed",
    )
  })

  it("treats an empty model list as unavailable", async () => {
    fetchAccountAvailableModelsMock.mockResolvedValue([])
    fetchUserGroupsMock.mockResolvedValue(createGroups(["default"]))

    const { result } = renderSubject({
      isOpen: true,
      currentAccount: ACCOUNT,
      initialGroup: "default",
    })

    await waitFor(() => {
      expect(result.current.groups).toEqual(createGroups(["default"]))
    })

    await act(async () => {
      await expect(result.current.loadAvailableModels()).resolves.toBe(false)
    })

    expect(result.current.availableModels).toEqual([])
    expect(result.current.modelLoadErrorMessage).toBe(
      "keyManagement:dialog.modelLoadFailed",
    )
  })

  it("keeps group bootstrap independent from optional model discovery", async () => {
    fetchAccountAvailableModelsMock.mockRejectedValue(
      new Error("model lookup forbidden"),
    )
    fetchUserGroupsMock.mockResolvedValue(createGroups(["default"]))

    const { result } = renderSubject({
      isOpen: true,
      currentAccount: ACCOUNT,
      initialGroup: "default",
    })

    await waitFor(() => {
      expect(result.current.groups).toEqual(createGroups(["default"]))
    })

    expect(fetchAccountAvailableModelsMock).not.toHaveBeenCalled()
    expect(result.current.isLoading).toBe(false)
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it("deduplicates concurrent model discovery requests for one account", async () => {
    const deferredModels = createDeferred<string[]>()
    fetchAccountAvailableModelsMock.mockReturnValue(deferredModels.promise)
    fetchUserGroupsMock.mockResolvedValue(createGroups(["default"]))

    const { result } = renderSubject({
      isOpen: true,
      currentAccount: ACCOUNT,
      initialGroup: "default",
    })

    await waitFor(() => {
      expect(result.current.groups).toEqual(createGroups(["default"]))
    })

    let firstRequest!: Promise<boolean>
    let secondRequest!: Promise<boolean>
    act(() => {
      firstRequest = result.current.loadAvailableModels()
      secondRequest = result.current.loadAvailableModels()
    })

    expect(fetchAccountAvailableModelsMock).toHaveBeenCalledTimes(1)

    deferredModels.resolve(["example-model"])
    await act(async () => {
      await expect(Promise.all([firstRequest, secondRequest])).resolves.toEqual(
        [true, true],
      )
    })

    expect(result.current.availableModels).toEqual(["example-model"])
  })

  it("ignores a model response that arrives after switching accounts", async () => {
    const previousModels = createDeferred<string[]>()
    const currentModels = createDeferred<string[]>()
    const nextAccount = { ...ACCOUNT, id: "acc-2", name: "Example 2" }
    fetchAccountAvailableModelsMock
      .mockReturnValueOnce(previousModels.promise)
      .mockReturnValueOnce(currentModels.promise)
    fetchUserGroupsMock.mockResolvedValue(createGroups(["default"]))

    const { result, rerender } = renderSubject({
      isOpen: true,
      currentAccount: ACCOUNT,
      initialGroup: "default",
    })

    await waitFor(() => {
      expect(result.current.groups).toEqual(createGroups(["default"]))
    })

    let previousRequest!: Promise<boolean>
    act(() => {
      previousRequest = result.current.loadAvailableModels()
    })
    const previousAbortSignal = fetchAccountAvailableModelsMock.mock
      .calls[0]?.[1]?.abortSignal as AbortSignal
    expect(previousAbortSignal.aborted).toBe(false)

    rerender({
      isOpen: true,
      currentAccount: nextAccount,
      initialGroup: "default",
    })
    await waitFor(() => {
      expect(previousAbortSignal.aborted).toBe(true)
    })

    let currentRequest!: Promise<boolean>
    act(() => {
      currentRequest = result.current.loadAvailableModels()
    })
    currentModels.resolve(["current-model"])

    await act(async () => {
      await expect(currentRequest).resolves.toBe(true)
    })

    previousModels.resolve(["stale-model"])
    await act(async () => {
      await expect(previousRequest).resolves.toBe(false)
    })

    expect(result.current.availableModels).toEqual(["current-model"])
    expect(fetchAccountAvailableModelsMock).toHaveBeenCalledTimes(2)
  })

  it("cancels active model discovery when dialog data resets", async () => {
    const deferredModels = createDeferred<string[]>()
    fetchAccountAvailableModelsMock.mockReturnValue(deferredModels.promise)
    fetchUserGroupsMock.mockResolvedValue(createGroups(["default"]))

    const { result } = renderSubject({
      isOpen: true,
      currentAccount: ACCOUNT,
      initialGroup: "default",
    })

    await waitFor(() => {
      expect(result.current.groups).toEqual(createGroups(["default"]))
    })

    let request!: Promise<boolean>
    act(() => {
      request = result.current.loadAvailableModels()
    })
    const abortSignal = fetchAccountAvailableModelsMock.mock.calls[0]?.[1]
      ?.abortSignal as AbortSignal
    expect(abortSignal.aborted).toBe(false)

    act(() => {
      result.current.resetData()
    })
    expect(abortSignal.aborted).toBe(true)

    deferredModels.resolve(["stale-model"])
    await act(async () => {
      await expect(request).resolves.toBe(false)
    })
    expect(result.current.availableModels).toEqual([])
  })

  it("shows the localized fallback error when loading bootstrap data fails without a message", async () => {
    fetchAccountAvailableModelsMock.mockResolvedValue(["gpt-4o-mini"])
    fetchUserGroupsMock.mockRejectedValue("")

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
