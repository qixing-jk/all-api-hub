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

const {
  getAndClearPendingSponsorAddAccountPrefillMock,
  isExtensionSidePanelMock,
  stopWatchingPendingSponsorAddAccountPrefillMock,
  watchPendingSponsorAddAccountPrefillMock,
} = vi.hoisted(() => ({
  getAndClearPendingSponsorAddAccountPrefillMock: vi.fn(),
  isExtensionSidePanelMock: vi.fn(() => false),
  stopWatchingPendingSponsorAddAccountPrefillMock: vi.fn(),
  watchPendingSponsorAddAccountPrefillMock: vi.fn(),
}))

vi.mock("~/features/AccountManagement/hooks/AccountDataContext", () => ({
  useAccountDataContext: () => ({
    loadAccountData: vi.fn(),
  }),
}))

vi.mock("~/features/AccountManagement/components/AccountDialog", () => ({
  default: (props: any) => {
    accountDialogProps.current = props
    accountDialogProps.renderCount += 1
    return (
      <div data-testid="account-dialog">{JSON.stringify(props.prefill)}</div>
    )
  },
}))

vi.mock(
  "~/features/AccountManagement/sponsors/pendingAddAccountIntent",
  () => ({
    getAndClearPendingSponsorAddAccountPrefill:
      getAndClearPendingSponsorAddAccountPrefillMock,
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
})
