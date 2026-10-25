import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DIALOG_MODES } from "~/constants/dialogModes"
import { SITE_TYPES } from "~/constants/siteType"
import { DialogStateProvider } from "~/features/AccountManagement/dialogs/DialogStateProvider"
import { useDialogStateContext } from "~/features/AccountManagement/dialogs/useDialogStateContext"
import { BOOKMARK_IMPORT_ADD_ACCOUNT_PREFILL_SOURCE } from "~/features/AccountManagement/sponsors/types"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"
import { render, screen } from "~~/tests/test-utils/render"

const accountDialogProps = vi.hoisted(() => ({
  current: null as any,
  renderCount: 0,
  inOptions: false,
}))

const loadAccountDataMock = vi.hoisted(() => vi.fn())

const { isExtensionSidePanelMock, isAddAccountPrefillMock } = vi.hoisted(
  () => ({
    isExtensionSidePanelMock: vi.fn(() => false),
    isAddAccountPrefillMock: vi.fn((value: unknown) => {
      return (
        typeof value === "object" &&
        value !== null &&
        ["sponsor", "bookmark-import"].includes((value as any).source)
      )
    }),
  }),
)

vi.mock("~/features/AccountManagement/data/AccountDataContext", () => ({
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

vi.mock("~/features/AccountManagement/sponsors/addAccountPrefill", () => ({
  isAddAccountPrefill: isAddAccountPrefillMock,
}))

vi.mock("~/utils/browser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/browser")>()
  return {
    ...actual,
    isExtensionSidePanel: isExtensionSidePanelMock,
    isExtensionOptions: () => accountDialogProps.inOptions,
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
  it.each([undefined, "check-in"] as const)(
    "opens the account editor with focus %s",
    async (focusSection) => {
      const user = userEvent.setup()
      const account = buildDisplaySiteData()
      function EditHarness() {
        const { openEditAccount } = useDialogStateContext()
        return (
          <button
            onClick={() =>
              openEditAccount(
                account,
                focusSection ? { focusSection } : undefined,
              )
            }
          >
            edit account
          </button>
        )
      }
      render(
        <DialogStateProvider>
          <EditHarness />
        </DialogStateProvider>,
        {
          withUserPreferencesProvider: false,
          withThemeProvider: false,
          withReleaseUpdateStatusProvider: false,
        },
      )
      await user.click(screen.getByRole("button", { name: "edit account" }))
      expect(accountDialogProps.current.mode).toBe(DIALOG_MODES.EDIT)
      expect(accountDialogProps.current.account).toEqual(account)
      expect(accountDialogProps.current.focusSection).toBe(focusSection)
    },
  )
  beforeEach(() => {
    accountDialogProps.current = null
    accountDialogProps.renderCount = 0
    vi.clearAllMocks()
    accountDialogProps.inOptions = false
    window.history.replaceState(null, "", "/")
    isExtensionSidePanelMock.mockReturnValue(false)
    isAddAccountPrefillMock.mockImplementation((value: unknown) => {
      return (
        typeof value === "object" &&
        value !== null &&
        ["sponsor", "bookmark-import"].includes((value as any).source)
      )
    })
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

  it("threads bookmark-import prefill through openAddAccount into AccountDialog", async () => {
    const user = userEvent.setup()

    function BookmarkImportHarness() {
      const { openAddAccount } = useDialogStateContext()
      return (
        <button
          type="button"
          onClick={() =>
            openAddAccount({
              source: BOOKMARK_IMPORT_ADD_ACCOUNT_PREFILL_SOURCE,
              siteUrl: "https://prefill.example.invalid",
            })
          }
        >
          recover
        </button>
      )
    }

    render(
      <DialogStateProvider>
        <BookmarkImportHarness />
      </DialogStateProvider>,
      {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
        withReleaseUpdateStatusProvider: false,
      },
    )

    await user.click(screen.getByRole("button", { name: "recover" }))

    expect(accountDialogProps.current).toMatchObject({
      mode: DIALOG_MODES.ADD,
      prefill: {
        source: BOOKMARK_IMPORT_ADD_ACCOUNT_PREFILL_SOURCE,
        siteUrl: "https://prefill.example.invalid",
      },
    })
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
