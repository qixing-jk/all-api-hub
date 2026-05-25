import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DIALOG_MODES } from "~/constants/dialogModes"
import { SITE_TYPES } from "~/constants/siteType"
import {
  DialogStateProvider,
  useDialogStateContext,
} from "~/features/AccountManagement/hooks/DialogStateContext"
import { render, screen } from "~~/tests/test-utils/render"

const accountDialogProps = vi.hoisted(() => ({
  current: null as any,
  renderCount: 0,
}))

const loadAccountDataMock = vi.hoisted(() => vi.fn())

const {
  getAndClearPendingSponsorAddAccountPrefillMock,
  isExtensionSidePanelMock,
  isSponsorAddAccountPrefillMock,
  stopWatchingPendingSponsorAddAccountPrefillMock,
  watchPendingSponsorAddAccountPrefillMock,
} = vi.hoisted(() => ({
  getAndClearPendingSponsorAddAccountPrefillMock: vi.fn(),
  isExtensionSidePanelMock: vi.fn(() => false),
  isSponsorAddAccountPrefillMock: vi.fn((value: unknown) => {
    return (
      typeof value === "object" &&
      value !== null &&
      (value as any).source === "sponsor"
    )
  }),
  stopWatchingPendingSponsorAddAccountPrefillMock: vi.fn(),
  watchPendingSponsorAddAccountPrefillMock: vi.fn(),
}))

vi.mock("~/features/AccountManagement/hooks/AccountDataContext", () => ({
  useAccountDataContext: () => ({
    loadAccountData: loadAccountDataMock,
  }),
}))

vi.mock("~/features/AccountManagement/components/AccountDialog", () => ({
  default: (props: any) => {
    accountDialogProps.current = props
    accountDialogProps.renderCount += 1
    return (
      <div data-testid="account-dialog">
        <span>{JSON.stringify(props.prefill)}</span>
        <button type="button" onClick={() => props.onSuccess({ id: "saved" })}>
          save
        </button>
        <button type="button" onClick={() => props.onError(new Error("boom"))}>
          fail
        </button>
        <button type="button" onClick={props.onClose}>
          close
        </button>
      </div>
    )
  },
}))

vi.mock(
  "~/features/AccountManagement/sponsors/pendingAddAccountIntent",
  () => ({
    getAndClearPendingSponsorAddAccountPrefill:
      getAndClearPendingSponsorAddAccountPrefillMock,
    isSponsorAddAccountPrefill: isSponsorAddAccountPrefillMock,
    watchPendingSponsorAddAccountPrefill:
      watchPendingSponsorAddAccountPrefillMock,
  }),
)

vi.mock("~/utils/browser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/browser")>()
  return {
    ...actual,
    isExtensionSidePanel: isExtensionSidePanelMock,
  }
})

function Harness() {
  const { openAccountDialog } = useDialogStateContext()

  const prefill = {
    siteUrl: "https://aihubmix.com",
    siteType: SITE_TYPES.AIHUBMIX,
    source: "sponsor" as const,
    sponsorId: "aihubmix",
  }

  return (
    <button
      type="button"
      onClick={() =>
        void openAccountDialog({
          mode: DIALOG_MODES.ADD,
          prefill,
        })
      }
    >
      open
    </button>
  )
}

describe("DialogStateContext sponsor prefill", () => {
  beforeEach(() => {
    accountDialogProps.current = null
    accountDialogProps.renderCount = 0
    vi.clearAllMocks()
    isExtensionSidePanelMock.mockReturnValue(false)
    isSponsorAddAccountPrefillMock.mockImplementation((value: unknown) => {
      return (
        typeof value === "object" &&
        value !== null &&
        (value as any).source === "sponsor"
      )
    })
    getAndClearPendingSponsorAddAccountPrefillMock.mockResolvedValue(null)
    watchPendingSponsorAddAccountPrefillMock.mockReturnValue(
      stopWatchingPendingSponsorAddAccountPrefillMock,
    )
  })

  it("threads add-account sponsor prefill into AccountDialog", async () => {
    const user = userEvent.setup()

    render(
      <DialogStateProvider>
        <Harness />
      </DialogStateProvider>,
      {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
        withReleaseUpdateStatusProvider: false,
      },
    )

    await user.click(screen.getByRole("button", { name: "open" }))

    expect(accountDialogProps.current.prefill).toEqual({
      siteUrl: "https://aihubmix.com",
      siteType: SITE_TYPES.AIHUBMIX,
      source: "sponsor",
      sponsorId: "aihubmix",
    })
    expect(screen.getByTestId("account-dialog")).toHaveTextContent("aihubmix")
  })

  it("opens add account without sponsor prefill when invoked from a click event", async () => {
    const user = userEvent.setup()

    function ClickHarness() {
      const { openAddAccount } = useDialogStateContext()
      return (
        <button type="button" onClick={openAddAccount}>
          add
        </button>
      )
    }

    render(
      <DialogStateProvider>
        <ClickHarness />
      </DialogStateProvider>,
      {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
        withReleaseUpdateStatusProvider: false,
      },
    )

    await user.click(screen.getByRole("button", { name: "add" }))

    expect(accountDialogProps.current).toMatchObject({
      mode: DIALOG_MODES.ADD,
      prefill: null,
    })
  })

  it("resolves and closes add-account dialogs after a successful save", async () => {
    const user = userEvent.setup()
    let result: Promise<unknown> | undefined

    function SaveHarness() {
      const { openAccountDialog } = useDialogStateContext()
      return (
        <button
          type="button"
          onClick={() => {
            result = openAccountDialog({ mode: DIALOG_MODES.ADD })
          }}
        >
          open
        </button>
      )
    }

    render(
      <DialogStateProvider>
        <SaveHarness />
      </DialogStateProvider>,
      {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
        withReleaseUpdateStatusProvider: false,
      },
    )

    await user.click(screen.getByRole("button", { name: "open" }))
    await user.click(screen.getByRole("button", { name: "save" }))

    await expect(result).resolves.toEqual({ id: "saved" })
    expect(screen.queryByTestId("account-dialog")).not.toBeInTheDocument()
    expect(loadAccountDataMock).toHaveBeenCalledTimes(1)
  })

  it("rejects and closes add-account dialogs after a save error", async () => {
    const user = userEvent.setup()
    let result: Promise<unknown> | undefined

    function ErrorHarness() {
      const { openAccountDialog } = useDialogStateContext()
      return (
        <button
          type="button"
          onClick={() => {
            result = openAccountDialog({ mode: DIALOG_MODES.ADD })
          }}
        >
          open
        </button>
      )
    }

    render(
      <DialogStateProvider>
        <ErrorHarness />
      </DialogStateProvider>,
      {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
        withReleaseUpdateStatusProvider: false,
      },
    )

    await user.click(screen.getByRole("button", { name: "open" }))

    const rejection = expect(result).rejects.toThrow("boom")
    await user.click(screen.getByRole("button", { name: "fail" }))
    await rejection
    expect(screen.queryByTestId("account-dialog")).not.toBeInTheDocument()
    expect(loadAccountDataMock).toHaveBeenCalledTimes(1)
  })

  it("opens add account from a pending side-panel sponsor prefill and clears the intent", async () => {
    isExtensionSidePanelMock.mockReturnValue(true)
    getAndClearPendingSponsorAddAccountPrefillMock.mockResolvedValueOnce({
      siteUrl: "https://aihubmix.com/path",
      siteType: SITE_TYPES.AIHUBMIX,
      source: "sponsor",
      sponsorId: "aihubmix",
    })

    render(
      <DialogStateProvider>
        <div>side panel</div>
      </DialogStateProvider>,
      {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
        withReleaseUpdateStatusProvider: false,
      },
    )

    expect(await screen.findByTestId("account-dialog")).toBeInTheDocument()
    expect(accountDialogProps.current).toMatchObject({
      mode: DIALOG_MODES.ADD,
      prefill: {
        siteUrl: "https://aihubmix.com/path",
        siteType: SITE_TYPES.AIHUBMIX,
        source: "sponsor",
        sponsorId: "aihubmix",
      },
    })
    expect(
      getAndClearPendingSponsorAddAccountPrefillMock,
    ).toHaveBeenCalledTimes(1)
  })

  it("opens add account when an already-mounted side panel receives a pending sponsor prefill signal", async () => {
    isExtensionSidePanelMock.mockReturnValue(true)
    getAndClearPendingSponsorAddAccountPrefillMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        siteUrl: "https://aihubmix.com/path",
        siteType: SITE_TYPES.AIHUBMIX,
        source: "sponsor",
        sponsorId: "aihubmix",
      })

    render(
      <DialogStateProvider>
        <div>side panel</div>
      </DialogStateProvider>,
      {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
        withReleaseUpdateStatusProvider: false,
      },
    )

    expect(watchPendingSponsorAddAccountPrefillMock).toHaveBeenCalledTimes(1)
    const onPendingPrefill =
      watchPendingSponsorAddAccountPrefillMock.mock.calls[0]?.[0]
    expect(onPendingPrefill).toEqual(expect.any(Function))

    onPendingPrefill()

    expect(await screen.findByTestId("account-dialog")).toBeInTheDocument()
    expect(accountDialogProps.current).toMatchObject({
      mode: DIALOG_MODES.ADD,
      prefill: {
        siteUrl: "https://aihubmix.com/path",
        siteType: SITE_TYPES.AIHUBMIX,
        source: "sponsor",
        sponsorId: "aihubmix",
      },
    })
    expect(accountDialogProps.renderCount).toBe(1)
    expect(
      getAndClearPendingSponsorAddAccountPrefillMock,
    ).toHaveBeenCalledTimes(2)
  })

  it("stops watching pending sponsor prefill when a side panel unmounts", () => {
    isExtensionSidePanelMock.mockReturnValue(true)

    const { unmount } = render(
      <DialogStateProvider>
        <div>side panel</div>
      </DialogStateProvider>,
      {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
        withReleaseUpdateStatusProvider: false,
      },
    )

    unmount()

    expect(stopWatchingPendingSponsorAddAccountPrefillMock).toHaveBeenCalled()
  })

  it("throws when useDialogStateContext is rendered outside its provider", () => {
    function InvalidHarness() {
      useDialogStateContext()
      return null
    }

    expect(() =>
      render(<InvalidHarness />, {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
        withReleaseUpdateStatusProvider: false,
      }),
    ).toThrow("useDialogStateContext")
  })
})
