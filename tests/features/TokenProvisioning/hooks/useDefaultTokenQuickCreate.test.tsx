import { renderHook } from "@testing-library/react"
import { act } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  DEFAULT_TOKEN_QUICK_CREATE_STATE_KINDS,
  useDefaultTokenQuickCreate,
} from "~/features/TokenProvisioning/hooks/useDefaultTokenQuickCreate"
import { TOKEN_QUICK_CREATE_RESOLUTION_KINDS } from "~/services/accounts/tokenQuickCreateResolution"
import { TOKEN_PROVISIONING_BLOCK_REASONS } from "~/services/apiAdapters/contracts/tokenProvisioning"
import { createDeferred } from "~~/tests/test-utils/deferred"
import {
  buildApiToken,
  buildDisplaySiteData,
} from "~~/tests/test-utils/factories"
import { waitFor } from "~~/tests/test-utils/render"

const { resolveQuickCreateMock, createTokenMock } = vi.hoisted(() => ({
  resolveQuickCreateMock: vi.fn(),
  createTokenMock: vi.fn(),
}))

vi.mock("~/services/accounts/tokenQuickCreateResolution", async () => {
  const actual = await vi.importActual<
    typeof import("~/services/accounts/tokenQuickCreateResolution")
  >("~/services/accounts/tokenQuickCreateResolution")
  return {
    ...actual,
    resolveDefaultTokenQuickCreateResolution: resolveQuickCreateMock,
  }
})

vi.mock("~/services/accounts/utils/apiServiceRequest", () => ({
  createDisplayAccountApiContext: () => ({
    keyManagement: { createToken: createTokenMock },
    request: { baseUrl: "https://api.example.invalid" },
  }),
  requireDisplayAccountKeyManagement: (
    _account: unknown,
    keyManagement: unknown,
  ) => keyManagement,
}))

const account = buildDisplaySiteData({
  siteType: SITE_TYPES.MODELFLARE,
  baseUrl: "https://portal.example.invalid",
})

describe("useDefaultTokenQuickCreate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("selects a group, creates the token, and reports the created token", async () => {
    const createdToken = buildApiToken({ group: "vip" })
    const pendingCreate = createDeferred<typeof createdToken>()
    const onCreated = vi.fn()
    resolveQuickCreateMock
      .mockResolvedValueOnce({
        kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.SelectionRequired,
        allowedGroups: ["default", "vip"],
        suggestedGroup: "default",
        groups: {
          default: { desc: "Default", ratio: 1 },
          vip: { desc: "VIP", ratio: 2 },
        },
      })
      .mockResolvedValueOnce({
        kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Ready,
        tokenData: { name: "Example key", group: "vip" },
      })
    createTokenMock.mockReturnValueOnce(pendingCreate.promise)

    const { result } = renderHook(() =>
      useDefaultTokenQuickCreate({
        isActive: true,
        account,
        canCreate: true,
        onCreated,
      }),
    )

    await act(async () => result.current.start())
    expect(result.current.state).toMatchObject({
      kind: DEFAULT_TOKEN_QUICK_CREATE_STATE_KINDS.Selecting,
      selection: {
        suggestedGroup: "default",
        groups: {
          default: { desc: "Default", ratio: 1 },
          vip: { desc: "VIP", ratio: 2 },
        },
      },
    })

    let confirmPromise: Promise<void> | undefined
    act(() => {
      confirmPromise = result.current.confirmGroup(" vip ")
    })
    await waitFor(() => {
      expect(result.current.view).toMatchObject({
        isBusy: true,
        isCreating: true,
      })
    })

    pendingCreate.resolve(createdToken)
    await act(async () => confirmPromise)

    expect(createTokenMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ group: "vip" }),
    )
    expect(onCreated).toHaveBeenCalledWith(createdToken)
    expect(result.current.state).toEqual({
      kind: DEFAULT_TOKEN_QUICK_CREATE_STATE_KINDS.Idle,
      error: null,
    })
  })

  it("keeps selection open when token creation fails", async () => {
    resolveQuickCreateMock
      .mockResolvedValueOnce({
        kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.SelectionRequired,
        allowedGroups: ["default", "vip"],
        suggestedGroup: "default",
        groups: {},
      })
      .mockResolvedValueOnce({
        kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Ready,
        tokenData: { name: "Example key", group: "default" },
      })
    createTokenMock.mockResolvedValueOnce(false)

    const { result } = renderHook(() =>
      useDefaultTokenQuickCreate({
        isActive: true,
        account,
        canCreate: true,
        onCreated: vi.fn(),
      }),
    )

    await act(async () => result.current.start())
    await act(async () => result.current.confirmGroup("default"))

    expect(result.current.state).toMatchObject({
      kind: DEFAULT_TOKEN_QUICK_CREATE_STATE_KINDS.Selecting,
      error: expect.stringContaining("ui:dialog.copyKey.createFailed"),
    })
  })

  it("cancels selection without creating a token", async () => {
    resolveQuickCreateMock.mockResolvedValueOnce({
      kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.SelectionRequired,
      allowedGroups: ["default", "vip"],
      suggestedGroup: "default",
      groups: {},
    })

    const { result } = renderHook(() =>
      useDefaultTokenQuickCreate({
        isActive: true,
        account,
        canCreate: true,
        onCreated: vi.fn(),
      }),
    )

    await act(async () => result.current.start())
    act(() => result.current.cancelSelection())

    expect(result.current.state).toEqual({
      kind: DEFAULT_TOKEN_QUICK_CREATE_STATE_KINDS.Idle,
      error: null,
    })
    expect(createTokenMock).not.toHaveBeenCalled()
  })

  it("ignores a stale policy result after the active account changes", async () => {
    const pendingResolution = createDeferred<{
      kind: typeof TOKEN_QUICK_CREATE_RESOLUTION_KINDS.SelectionRequired
      allowedGroups: string[]
      suggestedGroup: string
      groups: Record<string, { desc: string; ratio: number }>
    }>()
    resolveQuickCreateMock.mockReturnValueOnce(pendingResolution.promise)
    const replacementAccount = buildDisplaySiteData({ id: "account-2" })
    const onCreated = vi.fn()

    const { result, rerender } = renderHook(
      ({ currentAccount }) =>
        useDefaultTokenQuickCreate({
          isActive: true,
          account: currentAccount,
          canCreate: true,
          onCreated,
        }),
      { initialProps: { currentAccount: account } },
    )

    let startPromise: Promise<void> | undefined
    act(() => {
      startPromise = result.current.start()
    })
    await waitFor(() =>
      expect(result.current.state.kind).toBe(
        DEFAULT_TOKEN_QUICK_CREATE_STATE_KINDS.Resolving,
      ),
    )

    rerender({ currentAccount: replacementAccount })
    pendingResolution.resolve({
      kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.SelectionRequired,
      allowedGroups: ["default", "vip"],
      suggestedGroup: "default",
      groups: {},
    })
    await act(async () => startPromise)

    expect(result.current.state).toEqual({
      kind: DEFAULT_TOKEN_QUICK_CREATE_STATE_KINDS.Idle,
      error: null,
    })
    expect(createTokenMock).not.toHaveBeenCalled()
    expect(onCreated).not.toHaveBeenCalled()

    resolveQuickCreateMock.mockResolvedValueOnce({
      kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Blocked,
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.AvailableGroupRequired,
      message: "No available groups",
    })
    await act(async () => result.current.start())

    expect(resolveQuickCreateMock).toHaveBeenLastCalledWith(replacementAccount)
    expect(result.current.state).toEqual({
      kind: DEFAULT_TOKEN_QUICK_CREATE_STATE_KINDS.Idle,
      error: "No available groups",
    })
  })

  it("surfaces policy blocks without attempting token creation", async () => {
    resolveQuickCreateMock.mockResolvedValueOnce({
      kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Blocked,
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.AvailableGroupRequired,
      message: "No available groups",
    })

    const { result } = renderHook(() =>
      useDefaultTokenQuickCreate({
        isActive: true,
        account,
        canCreate: true,
        onCreated: vi.fn(),
      }),
    )

    await act(async () => result.current.start())

    expect(result.current.state).toEqual({
      kind: DEFAULT_TOKEN_QUICK_CREATE_STATE_KINDS.Idle,
      error: "No available groups",
    })
    expect(createTokenMock).not.toHaveBeenCalled()
  })

  it("reports unsupported creation before resolving provider policy", async () => {
    const { result } = renderHook(() =>
      useDefaultTokenQuickCreate({
        isActive: true,
        account,
        canCreate: false,
        onCreated: vi.fn(),
      }),
    )

    await act(async () => result.current.start())

    expect(result.current.state).toEqual({
      kind: DEFAULT_TOKEN_QUICK_CREATE_STATE_KINDS.Idle,
      error: "ui:dialog.copyKey.createNotSupported",
    })
    expect(resolveQuickCreateMock).not.toHaveBeenCalled()
    expect(createTokenMock).not.toHaveBeenCalled()
  })

  it("ignores group confirmation outside the selection state", async () => {
    const { result } = renderHook(() =>
      useDefaultTokenQuickCreate({
        isActive: true,
        account,
        canCreate: true,
        onCreated: vi.fn(),
      }),
    )

    await act(async () => result.current.confirmGroup("vip"))

    expect(resolveQuickCreateMock).not.toHaveBeenCalled()
    expect(createTokenMock).not.toHaveBeenCalled()
  })
})
