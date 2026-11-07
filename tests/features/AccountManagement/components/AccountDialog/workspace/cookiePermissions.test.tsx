import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"

import { useAccountCookiePermissions } from "~/features/AccountManagement/components/AccountDialog/form/useAccountCookiePermissions"
import { AuthTypeEnum } from "~/types"

const deps = vi.hoisted(() => ({
  permissions: ["cookies"],
  read: vi.fn(),
  request: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))
vi.mock("~/services/permissions/permissionManager", () => ({
  OPTIONAL_PERMISSIONS: deps.permissions,
  OPTIONAL_PERMISSION_IDS: { Cookies: "cookies" },
  hasPermissions: deps.read,
  ensurePermissionsDetailed: deps.request,
  onOptionalPermissionsChanged: () => () => {},
}))
vi.mock("~/lib/notify", () => ({
  default: { success: deps.success, error: deps.error },
}))
vi.mock("~/services/productAnalytics/facts/permissions", () => ({
  trackOptionalPermissionRequestResult: vi.fn(),
}))
beforeEach(() => {
  vi.resetAllMocks()
  deps.permissions.splice(0, deps.permissions.length, "cookies")
  deps.read.mockResolvedValue(false)
})
const renderPermissions = () =>
  renderHook(() =>
    useAccountCookiePermissions({
      isOpen: true,
      authType: AuthTypeEnum.Cookie,
    }),
  )
it("refreshes permission state after an in-flight read is invalidated", async () => {
  let finish!: (granted: boolean) => void
  deps.read
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    .mockResolvedValue(true)
  const { result } = renderPermissions()
  act(() => result.current.invalidate())
  await waitFor(() => expect(result.current.state.granted).toBe(true))
  await act(async () => finish(false))
  expect(result.current.state.granted).toBe(true)
})
it("accepts a manifest that already requires every Cookie permission without requesting more", async () => {
  deps.permissions.splice(0)
  const { result } = renderPermissions()
  await waitFor(() => expect(result.current.state.granted).toBe(false))
  await act(async () => {
    await result.current.requestPermissions()
  })
  expect(result.current.state.granted).toBe(true)
  expect(deps.request).not.toHaveBeenCalled()
})
it("ignores a stale permission read rejection", async () => {
  let fail!: (error: Error) => void
  deps.read.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject
      }),
  )
  const { result } = renderPermissions()
  act(() => result.current.invalidate())
  await act(async () => {
    fail(new Error("closed"))
  })
  expect(result.current.state.granted).toBe(false)
})
it.each(["read", "request"])(
  "suppresses stale %s completion feedback",
  async (phase) => {
    let finish!: () => void
    deps.request.mockResolvedValue({ success: true, requestedResults: [] })
    const { result } = renderPermissions()
    await waitFor(() => expect(result.current.state.granted).toBe(false))
    if (phase === "read")
      deps.read.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = () => resolve(true)
          }),
      )
    else
      deps.request.mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            finish = () => reject(new Error("closed"))
          }),
      )
    let pending!: Promise<void>
    await act(async () => {
      pending = result.current.requestPermissions()
      await Promise.resolve()
    })
    act(() => result.current.invalidate())
    await act(async () => {
      finish()
      await pending
    })
    expect(result.current.state.pending).toBe(false)
    expect(deps.success).not.toHaveBeenCalled()
    expect(deps.error).not.toHaveBeenCalled()
  },
)
