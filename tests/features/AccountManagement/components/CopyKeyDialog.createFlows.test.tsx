import "./copyKeyDialogMocks"

import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import CopyKeyDialog from "~/features/AccountManagement/components/CopyKeyDialog"
import { useCopyKeyDialog } from "~/features/AccountManagement/components/CopyKeyDialog/hooks/useCopyKeyDialog"
import { generateDefaultTokenRequest } from "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken"
import { TOKEN_QUICK_CREATE_RESOLUTION_KINDS } from "~/services/accounts/tokenQuickCreateResolution"
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "~~/tests/test-utils/render"

import {
  createApiTokenMock,
  fetchAccountAvailableModelsMock,
  fetchAccountTokensMock,
  fetchUserGroupsMock,
  toastSuccessMock,
} from "./copyKeyDialogMocks"
import {
  ACCOUNT,
  AIHUBMIX_ACCOUNT,
  resolveDefaultTokenQuickCreateResolutionSpy,
  setupCopyKeyDialogTestDefaults,
  TOKEN,
} from "./copyKeyDialogTestSupport"

describe("CopyKeyDialog create flows", () => {
  beforeEach(() => {
    setupCopyKeyDialogTestDefaults()
  })

  it("creates token then refreshes and auto-copies when exactly one token exists", async () => {
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([TOKEN])
    createApiTokenMock.mockResolvedValueOnce(true)

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    const createButton = await screen.findByRole("button", {
      name: "ui:dialog.copyKey.createKey",
    })
    await user.click(createButton)

    await waitFor(() => {
      expect(createApiTokenMock).toHaveBeenCalledTimes(1)
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
      expect(writeText).toHaveBeenCalledWith("sk-test")
    })
  })

  it("shows a create failure when default key creation returns false", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])
    createApiTokenMock.mockResolvedValueOnce(false)

    const user = userEvent.setup()

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    )

    expect(
      await screen.findByText("ui:dialog.copyKey.createFailed"),
    ).toBeInTheDocument()
  })

  it("shows a one-time key dialog when AIHubMix create returns a full token", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])
    createApiTokenMock.mockResolvedValueOnce({
      ...TOKEN,
      id: 9,
      key: "sk-created-full-secret",
      name: "aihubmix-default",
    })

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(
      <CopyKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={AIHUBMIX_ACCOUNT}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    )

    expect(
      await screen.findByText("keyManagement:oneTimeKey.title"),
    ).toBeInTheDocument()
    expect(screen.getByText("aihubmix-default")).toBeInTheDocument()
    expect(
      screen.getByLabelText("keyManagement:oneTimeKey.keyLabel"),
    ).toHaveValue("sk-created-full-secret")

    await waitFor(() => {
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
      expect(writeText).toHaveBeenCalledWith("sk-created-full-secret")
    })
  })

  it("refreshes without auto-copying when AIHubMix create returns a masked key", async () => {
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...TOKEN, key: "sk-created********masked" }])
    createApiTokenMock.mockResolvedValueOnce({
      ...TOKEN,
      id: 9,
      key: "sk-created********masked",
      name: "aihubmix-masked",
    })

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(
      <CopyKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={AIHUBMIX_ACCOUNT}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    )

    await waitFor(() => {
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
    })
    expect(writeText).not.toHaveBeenCalled()
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "ui:dialog.copyKey.createSuccess",
    )
    expect(
      screen.queryByText("keyManagement:oneTimeKey.title"),
    ).not.toBeInTheDocument()
  })

  it("refreshes without auto-copying when a create-response-only token has an invalid secret", async () => {
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...TOKEN, key: "sk-created********masked" }])
    createApiTokenMock.mockResolvedValueOnce({
      ...TOKEN,
      id: 9,
      key: null,
      name: "invalid-created-token",
    })

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(
      <CopyKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={AIHUBMIX_ACCOUNT}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    )

    await waitFor(() => {
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
    })
    expect(writeText).not.toHaveBeenCalled()
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "ui:dialog.copyKey.createSuccess",
    )

    expect(
      screen.queryByText("keyManagement:oneTimeKey.title"),
    ).not.toBeInTheDocument()
  })

  it("shows a create error when refreshed inventory is not an array", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([]).mockResolvedValueOnce(null)
    createApiTokenMock.mockResolvedValueOnce(true)

    const user = userEvent.setup()

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    )

    expect(
      await screen.findByText("ui:dialog.copyKey.createFailed"),
    ).toBeInTheDocument()
    expect(screen.queryByText("invalid_token_payload")).not.toBeInTheDocument()
  })

  it("keeps the dialog actionable when create fails (retry works)", async () => {
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([TOKEN])
    createApiTokenMock
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(true)

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    const createButton = await screen.findByRole("button", {
      name: "ui:dialog.copyKey.createKey",
    })
    await user.click(createButton)

    expect(
      await screen.findByText("ui:dialog.copyKey.createFailed"),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "ui:dialog.copyKey.createKey" }),
    )

    await waitFor(() => {
      expect(createApiTokenMock).toHaveBeenCalledTimes(2)
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
      expect(writeText).toHaveBeenCalledWith("sk-test")
    })
  })

  it("keeps the dialog actionable when refresh stays empty after create (retry works)", async () => {
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([TOKEN])
    createApiTokenMock.mockResolvedValueOnce(true).mockResolvedValueOnce(true)

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    const createButton = await screen.findByRole("button", {
      name: "ui:dialog.copyKey.createKey",
    })
    await user.click(createButton)

    expect(
      await screen.findByText("ui:dialog.copyKey.noKeyFoundAfterCreate"),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "ui:dialog.copyKey.createKey" }),
    )

    await waitFor(() => {
      expect(createApiTokenMock).toHaveBeenCalledTimes(2)
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(3)
      expect(writeText).toHaveBeenCalledWith("sk-test")
    })
  })

  it("shows a success toast when refreshed inventory contains multiple tokens", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([]).mockResolvedValueOnce([
      TOKEN,
      {
        ...TOKEN,
        id: 2,
        key: "sk-second",
        name: "second",
      },
    ])
    createApiTokenMock.mockResolvedValueOnce(true)

    const user = userEvent.setup()

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    )

    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "ui:dialog.copyKey.createSuccess",
      )
    })
    expect(await screen.findByText("default")).toBeInTheDocument()
    expect(screen.getByText("second")).toBeInTheDocument()
  })

  it("does not start token creation for accounts without manageable credentials", async () => {
    render(
      <CopyKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={{ ...ACCOUNT, token: "", cookieAuthSessionCookie: "" }}
      />,
    )

    expect(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    ).toBeDisabled()
    expect(fetchAccountTokensMock).not.toHaveBeenCalled()
    expect(createApiTokenMock).not.toHaveBeenCalled()
  })

  it("reports unsupported post-create refresh after credentials are lost", async () => {
    const accountWithoutCredentials = {
      ...ACCOUNT,
      token: "",
      cookieAuthSessionCookie: "",
    }
    const { result } = renderHook(() =>
      useCopyKeyDialog(false, accountWithoutCredentials),
    )

    expect(result.current.canCreateDefaultKey).toBe(false)

    await act(async () => result.current.refreshRuntimeKeysAfterCreate())

    expect(result.current.postCreateError).toBe(
      "ui:dialog.copyKey.createNotSupported",
    )
    expect(fetchAccountTokensMock).not.toHaveBeenCalled()
  })

  it("shows ModelFlare group selection immediately without reopening the full Add Token flow", async () => {
    const modelFlareAccount = {
      ...ACCOUNT,
      siteType: SITE_TYPES.MODELFLARE,
    }
    const selectedGroupTokenData = {
      ...generateDefaultTokenRequest(),
      group: "vip",
    }
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([TOKEN])
    resolveDefaultTokenQuickCreateResolutionSpy
      .mockResolvedValueOnce({
        kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.SelectionRequired,
        allowedGroups: ["default", "vip"],
        suggestedGroup: "default",
        groups: {},
      })
      .mockResolvedValueOnce({
        kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Ready,
        tokenData: selectedGroupTokenData,
      })
    createApiTokenMock.mockResolvedValueOnce(true)

    const user = userEvent.setup()

    const { rerender } = render(
      <CopyKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={modelFlareAccount}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    )

    expect(
      await screen.findByRole("heading", {
        name: "messages:tokenProvisioning.selectGroupTitle",
      }),
    ).toBeVisible()
    expect(
      screen.getByText(
        "messages:tokenProvisioning.createRequiresGroupSelection",
      ),
    ).toBeVisible()
    expect(
      screen.queryByRole("heading", { name: "keyManagement:dialog.addToken" }),
    ).not.toBeInTheDocument()
    expect(fetchAccountAvailableModelsMock).not.toHaveBeenCalled()
    expect(resolveDefaultTokenQuickCreateResolutionSpy).toHaveBeenCalledWith(
      expect.objectContaining({ siteType: SITE_TYPES.MODELFLARE }),
    )
    expect(createApiTokenMock).not.toHaveBeenCalled()

    await user.click(
      screen.getByRole("combobox", {
        name: /^keyManagement:dialog\.groupLabel/,
      }),
    )
    await user.click(await screen.findByRole("option", { name: "vip" }))
    await user.click(
      screen.getByRole("button", { name: "keyManagement:dialog.createToken" }),
    )

    await waitFor(() => {
      expect(
        resolveDefaultTokenQuickCreateResolutionSpy,
      ).toHaveBeenLastCalledWith(
        expect.objectContaining({ siteType: SITE_TYPES.MODELFLARE }),
        { explicitGroup: "vip" },
      )
      expect(createApiTokenMock).toHaveBeenCalledTimes(1)
      expect(createApiTokenMock).toHaveBeenCalledWith(
        expect.any(Object),
        selectedGroupTokenData,
      )
    })
    expect(
      screen.queryByRole("heading", {
        name: "messages:tokenProvisioning.selectGroupTitle",
      }),
    ).not.toBeInTheDocument()

    rerender(
      <CopyKeyDialog
        isOpen={false}
        onClose={() => {}}
        account={modelFlareAccount}
      />,
    )
    await waitFor(() => {
      expect(
        screen.queryByText(
          "messages:tokenProvisioning.createRequiresGroupSelection",
        ),
      ).not.toBeInTheDocument()
    })
  })

  it("keeps group selection actionable when ModelFlare quick creation fails", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])
    resolveDefaultTokenQuickCreateResolutionSpy
      .mockResolvedValueOnce({
        kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.SelectionRequired,
        allowedGroups: ["default", "vip"],
        suggestedGroup: "default",
        groups: {},
      })
      .mockResolvedValueOnce({
        kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Ready,
        tokenData: {
          ...generateDefaultTokenRequest(),
          group: "default",
        },
      })
    createApiTokenMock.mockResolvedValueOnce(false)

    const user = userEvent.setup()

    render(
      <CopyKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={{ ...ACCOUNT, siteType: SITE_TYPES.MODELFLARE }}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    )
    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:dialog.createToken",
      }),
    )

    expect(
      await screen.findByRole("heading", {
        name: "messages:tokenProvisioning.selectGroupTitle",
      }),
    ).toBeVisible()
    expect(
      await screen.findByText("ui:dialog.copyKey.createFailed"),
    ).toBeVisible()
    expect(createApiTokenMock).toHaveBeenCalledTimes(1)
  })

  it("creates a default key with the full policy-resolved token payload", async () => {
    const policyTokenData = {
      name: "Policy Resolved Copy Key",
      remain_quota: 777,
      expired_time: -1,
      unlimited_quota: false,
      model_limits_enabled: false,
      model_limits: "",
      allow_ips: "",
      group: "vip",
    }

    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([TOKEN])
    resolveDefaultTokenQuickCreateResolutionSpy.mockResolvedValueOnce({
      kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Ready,
      tokenData: policyTokenData,
    })
    createApiTokenMock.mockResolvedValueOnce(true)

    const user = userEvent.setup()

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    )

    await waitFor(() => {
      expect(createApiTokenMock).toHaveBeenCalledWith(
        expect.any(Object),
        policyTokenData,
      )
    })
  })

  it("requires manual Sub2API group selection when quick create cannot pick one", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])
    fetchUserGroupsMock.mockResolvedValueOnce({
      vip: { desc: "VIP", ratio: 1 },
      pro: { desc: "Pro", ratio: 1 },
    })

    const user = userEvent.setup()

    render(
      <CopyKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={{
          ...ACCOUNT,
          siteType: SITE_TYPES.SUB2API,
          sub2apiAuth: {
            jwtToken: "jwt",
            refreshToken: "refresh",
            user: {
              id: "sub-user",
              email: "sub@example.com",
              displayName: "Sub User",
              group: "vip",
              groups: ["vip", "pro"],
            },
          },
        }}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    )

    await screen.findByText(
      "messages:tokenProvisioning.createRequiresGroupSelection",
    )
    expect(fetchUserGroupsMock).toHaveBeenCalled()
    expect(createApiTokenMock).not.toHaveBeenCalled()
  })

  it("creates a custom token via AddTokenDialog then refreshes and auto-copies when exactly one token exists", async () => {
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([TOKEN])
    fetchAccountAvailableModelsMock.mockResolvedValueOnce([])
    fetchUserGroupsMock.mockResolvedValueOnce({
      default: { desc: "default", ratio: 1 },
    })
    createApiTokenMock.mockResolvedValueOnce(true)

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    const customCreateButton = await screen.findByRole("button", {
      name: "ui:dialog.copyKey.createCustomKey",
    })
    await user.click(customCreateButton)

    const tokenNameInput = await screen.findByLabelText(
      /keyManagement:dialog\.tokenName/,
    )
    await user.clear(tokenNameInput)
    await user.type(tokenNameInput, "My Key")

    await user.click(
      screen.getByRole("button", { name: "keyManagement:dialog.createToken" }),
    )

    await waitFor(() => {
      expect(createApiTokenMock).toHaveBeenCalledTimes(1)
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
      expect(writeText).toHaveBeenCalledWith("sk-test")
    })

    expect(createApiTokenMock.mock.calls[0]?.[1]).toMatchObject({
      name: "My Key",
      remain_quota: -1,
      expired_time: -1,
      unlimited_quota: true,
      model_limits_enabled: false,
      model_limits: "",
      allow_ips: "",
      group: "default",
    })
  })

  it("shows one-time key dialog for custom AIHubMix AddTokenDialog create returns", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])
    fetchAccountAvailableModelsMock.mockResolvedValueOnce([])
    fetchUserGroupsMock.mockResolvedValueOnce({
      default: { desc: "default", ratio: 1 },
    })
    createApiTokenMock.mockResolvedValueOnce({
      ...TOKEN,
      id: 10,
      key: "sk-custom-full-secret",
      name: "My Key",
    })

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(
      <CopyKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={AIHUBMIX_ACCOUNT}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createCustomKey",
      }),
    )
    const tokenNameInput = await screen.findByLabelText(
      /keyManagement:dialog\.tokenName/,
    )
    await user.clear(tokenNameInput)
    await user.type(tokenNameInput, "My Key")
    await user.click(
      screen.getByRole("button", { name: "keyManagement:dialog.createToken" }),
    )

    expect(
      await screen.findByText("keyManagement:oneTimeKey.title"),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText("keyManagement:oneTimeKey.keyLabel"),
    ).toHaveValue("sk-custom-full-secret")

    await waitFor(() => {
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
      expect(writeText).toHaveBeenCalledWith("sk-custom-full-secret")
    })
  })
})
