import "./copyKeyDialogMocks"

import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import CopyKeyDialog from "~/features/AccountManagement/components/CopyKeyDialog"
import { useCopyKeyDialog } from "~/features/AccountManagement/components/CopyKeyDialog/hooks/useCopyKeyDialog"
import type { AccountKeyCreationResult } from "~/services/accounts/accountKeyCreation"
import { createUnattributedAccountCreatedRuntimeSecret } from "~/services/accounts/createdRuntimeSecret"
import { AccountKeyResourceError } from "~/services/apiAdapters/contracts/accountKeyResource"
import { buildNewApiKeyCreationResult } from "~~/tests/test-utils/accountKeyFixtures"
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "~~/tests/test-utils/render"

import {
  fetchAccountTokensMock,
  resolveApiTokenKeyMock,
  toastSuccessMock,
} from "./copyKeyDialogMocks"
import {
  ACCOUNT,
  AIHUBMIX_ACCOUNT,
  createDeferred,
  prepareAccountKeyCreationSpy,
  setupCopyKeyDialogTestDefaults,
  TOKEN,
} from "./copyKeyDialogTestSupport"

const { manualResult, manualProps } = vi.hoisted(() => ({
  manualResult: { current: null as AccountKeyCreationResult | null },
  manualProps: vi.fn(),
}))
vi.mock("~/features/TokenProvisioning/components/AddTokenDialog", () => ({
  default: (props: any) => {
    manualProps(props)
    return props.isOpen ? (
      <button onClick={() => props.onSuccess(manualResult.current)}>
        Submit native editor
      </button>
    ) : null
  },
}))
const creation = buildNewApiKeyCreationResult(ACCOUNT, TOKEN)
const start = async () => {
  const user = userEvent.setup()
  const writeText = vi
    .spyOn(navigator.clipboard, "writeText")
    .mockResolvedValue(undefined)
  render(<CopyKeyDialog isOpen onClose={() => {}} account={ACCOUNT} />)
  await user.click(
    await screen.findByRole("button", { name: "ui:dialog.copyKey.createKey" }),
  )
  return { user, writeText }
}
const plan = (result: AccountKeyCreationResult = creation) => {
  const create = vi.fn().mockResolvedValue(result)
  prepareAccountKeyCreationSpy.mockResolvedValue({ kind: "ready", create })
  return create
}

describe("CopyKeyDialog native creation handoff", () => {
  beforeEach(() => {
    setupCopyKeyDialogTestDefaults()
    manualProps.mockReset()
    manualResult.current = creation
  })

  it("copies the returned resource even when refreshed inventory contains several keys", async () => {
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ ...TOKEN, id: 2, name: "Other" }, TOKEN])
    const create = plan()
    const { writeText } = await start()
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("sk-test"))
    expect(create).toHaveBeenCalledTimes(1)
    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
  })

  it("recovers only the returned reference and never guesses from a single unrelated key", async () => {
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ ...TOKEN, id: 2 }])
    plan({ ref: creation.ref, facts: null })
    const { writeText } = await start()
    expect(
      await screen.findByText("ui:dialog.copyKey.noKeyFoundAfterCreate"),
    ).toBeVisible()
    expect(writeText).not.toHaveBeenCalled()
  })

  it("uses observed creation facts even if the independent inventory refresh fails", async () => {
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockRejectedValue(new Error("offline"))
    resolveApiTokenKeyMock.mockResolvedValue("sk-test")
    plan()
    const { writeText } = await start()
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("sk-test"))
  })

  it("keeps an unattributed one-time secret through refresh failure", async () => {
    const createdSecret = createUnattributedAccountCreatedRuntimeSecret({
      accountId: AIHUBMIX_ACCOUNT.id,
      displayName: "One-time",
      secret: "sk-one-time-example",
      credential: {
        accountName: AIHUBMIX_ACCOUNT.name,
        baseUrl: AIHUBMIX_ACCOUNT.baseUrl,
        apiType: "openai-compatible",
        tagIds: [],
      },
    })
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockRejectedValue(new Error("offline"))
    plan({ ref: null, facts: null, createdSecret })
    const user = userEvent.setup()
    render(
      <CopyKeyDialog isOpen onClose={() => {}} account={AIHUBMIX_ACCOUNT} />,
    )
    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    )
    expect(await screen.findByDisplayValue("sk-one-time-example")).toBeVisible()
    await waitFor(() => expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2))
    expect(screen.getByDisplayValue("sk-one-time-example")).toBeVisible()
  })

  it("keeps a definitive failure retryable but never repeats an uncertain write", async () => {
    fetchAccountTokensMock.mockResolvedValue([])
    const create = plan()
    create
      .mockRejectedValueOnce(new Error("denied"))
      .mockRejectedValueOnce(
        new AccountKeyResourceError({ code: "mutation_state_uncertain" }),
      )
    const { user } = await start()
    expect(
      await screen.findByText(/ui:dialog.copyKey.createFailed/),
    ).toBeVisible()
    await user.click(
      screen.getByRole("button", { name: "ui:dialog.copyKey.createKey" }),
    )
    expect(
      await screen.findByText("keyManagement:native.editor.feedback.uncertain"),
    ).toBeVisible()
    await user.click(
      screen.getByRole("button", { name: "ui:dialog.copyKey.createKey" }),
    )
    expect(create).toHaveBeenCalledTimes(2)
  })

  it.each(["sub2api", "modelflare"])(
    "confirms opaque %s group requirements without rebuilding a write payload",
    async (siteType) => {
      fetchAccountTokensMock.mockResolvedValue([])
      const create = vi.fn().mockResolvedValue({ ref: null, facts: null })
      prepareAccountKeyCreationSpy.mockResolvedValue({
        kind: "selection-required",
        requirements: [
          {
            requirementKey: "opaque-9",
            displayName: "default",
            provisioning: { kind: "automatic" },
          },
          {
            requirementKey: "opaque-10",
            displayName: "vip",
            provisioning: { kind: "automatic" },
          },
        ],
        create,
      })
      const user = userEvent.setup()
      render(
        <CopyKeyDialog
          isOpen
          onClose={() => {}}
          account={{ ...ACCOUNT, siteType }}
        />,
      )
      await user.click(
        await screen.findByRole("button", {
          name: "ui:dialog.copyKey.createKey",
        }),
      )
      await user.click(
        await screen.findByRole("combobox", {
          name: /^keyManagement:dialog.groupLabel/,
        }),
      )
      await user.click(await screen.findByRole("option", { name: "vip" }))
      await user.click(
        screen.getByRole("button", {
          name: "keyManagement:dialog.createToken",
        }),
      )
      await waitFor(() =>
        expect(create).toHaveBeenCalledExactlyOnceWith("opaque-10"),
      )
      expect(prepareAccountKeyCreationSpy).toHaveBeenCalledTimes(1)
    },
  )

  it("opens the native editor for missing required input and transfers its creation result", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([]).mockResolvedValue([TOKEN])
    prepareAccountKeyCreationSpy.mockResolvedValue({ kind: "input-required" })
    const { user, writeText } = await start()
    await user.click(
      await screen.findByRole("button", { name: "Submit native editor" }),
    )
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("sk-test"))
    expect(manualProps).toHaveBeenCalledWith(
      expect.objectContaining({ showOneTimeKeyDialog: false }),
    )
  })

  it("drops a late creation handoff when credentials change", async () => {
    fetchAccountTokensMock.mockResolvedValue([])
    const pending = createDeferred<AccountKeyCreationResult>()
    const create = vi.fn().mockReturnValue(pending.promise)
    prepareAccountKeyCreationSpy.mockResolvedValue({ kind: "ready", create })
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, "writeText")
    const { rerender } = render(
      <CopyKeyDialog isOpen onClose={() => {}} account={ACCOUNT} />,
    )
    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    )
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    rerender(
      <CopyKeyDialog
        isOpen
        onClose={() => {}}
        account={{ ...ACCOUNT, token: "other-login" }}
      />,
    )
    await act(async () => {
      pending.resolve(creation)
      await pending.promise
    })
    expect(writeText).not.toHaveBeenCalled()
    expect(toastSuccessMock).not.toHaveBeenCalled()
  })

  it("does not open a creation plan without manageable credentials", async () => {
    const account = { ...ACCOUNT, token: "", userId: "" }
    const { result } = renderHook(() => useCopyKeyDialog(true, account))
    expect(result.current.canCreateDefaultKey).toBe(false)
    expect(fetchAccountTokensMock).not.toHaveBeenCalled()
    expect(prepareAccountKeyCreationSpy).not.toHaveBeenCalled()
  })
})
