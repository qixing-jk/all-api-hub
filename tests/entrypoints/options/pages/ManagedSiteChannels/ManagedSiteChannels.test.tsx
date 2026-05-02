import userEvent from "@testing-library/user-event"
import toast from "react-hot-toast"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ChannelDialogContainer } from "~/components/dialogs/ChannelDialog"
import { AXON_HUB_CHANNEL_TYPE } from "~/constants/axonHub"
import { CLAUDE_CODE_HUB_PROVIDER_TYPE } from "~/constants/claudeCodeHub"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  AXON_HUB,
  CLAUDE_CODE_HUB,
  DONE_HUB,
  NEW_API,
  OCTOPUS,
  VELOERA,
} from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import ManagedSiteChannels from "~/entrypoints/options/pages/ManagedSiteChannels"
import { fetchChannelFilters } from "~/features/ManagedSiteChannels/utils/channelFilters"
import {
  getManagedSiteService,
  getManagedSiteServiceForType,
} from "~/services/managedSites/managedSiteService"
import {
  ensureNewApiManagedSession,
  fetchNewApiChannelKey,
  isNewApiVerifiedSessionActive,
  NEW_API_MANAGED_SESSION_STATUSES,
} from "~/services/managedSites/providers/newApiSession"
import { sendRuntimeMessage } from "~/utils/browser/browserApi"
import {
  navigateWithinOptionsPage,
  openManagedSiteModelSyncForChannel,
  openSettingsTab,
} from "~/utils/navigation"
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "~~/tests/test-utils/render"

vi.mock("~/utils/browser/browserApi", async (importActual) => {
  const actual = (await importActual()) as any
  return { ...actual, sendRuntimeMessage: vi.fn() }
})

vi.mock("~/services/managedSites/managedSiteService", async (importActual) => {
  const actual = (await importActual()) as any
  return {
    ...actual,
    getManagedSiteService: vi.fn(),
    getManagedSiteServiceForType: vi.fn(),
  }
})

vi.mock(
  "~/services/managedSites/providers/newApiSession",
  async (importActual) => {
    const actual = (await importActual()) as any
    return {
      ...actual,
      ensureNewApiManagedSession: vi.fn(),
      fetchNewApiChannelKey: vi.fn(),
      isNewApiVerifiedSessionActive: vi.fn(),
    }
  },
)

vi.mock("~/contexts/UserPreferencesContext", async (importActual) => {
  const actual = (await importActual()) as any
  return { ...actual, useUserPreferencesContext: vi.fn() }
})

vi.mock("~/utils/navigation", async (importActual) => {
  const actual = (await importActual()) as any
  return {
    ...actual,
    navigateWithinOptionsPage: vi.fn(),
    openManagedSiteModelSyncForChannel: vi.fn(),
    openSettingsTab: vi.fn(),
  }
})

vi.mock("react-hot-toast", () => ({
  default: {
    dismiss: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    success: vi.fn(),
  },
}))

const { mockFetchChannelFilters } = vi.hoisted(() => ({
  mockFetchChannelFilters: vi.fn(),
}))

vi.mock("~/features/ManagedSiteChannels/utils/channelFilters", async () => ({
  fetchChannelFilters: mockFetchChannelFilters,
  saveChannelFilters: vi.fn(),
}))

const waitForRowText = (text: string) =>
  waitFor(() => expect(screen.getByText(text)).toBeInTheDocument(), {
    timeout: 3000,
  })

const waitForChannelsRefreshIdle = () =>
  waitFor(
    () => {
      expect(
        screen.getByRole("button", {
          name: "managedSiteChannels:toolbar.refresh",
        }),
      ).toBeEnabled()
    },
    { timeout: 3000 },
  )

const rowActionMenuItemNames = [
  "managedSiteChannels:table.rowActions.edit",
  "managedSiteChannels:table.rowActions.view",
  "managedSiteChannels:table.rowActions.sync",
  "managedSiteChannels:table.rowActions.filters",
  "managedSiteChannels:table.rowActions.openSync",
  "managedSiteChannels:table.rowActions.migrate",
]

const getOpenRowActionItem = () =>
  rowActionMenuItemNames
    .map((name) => screen.queryByRole("menuitem", { name }))
    .find((item) => item !== null) ?? null

/**
 * Open the Radix row-actions dropdown with one user-event instance.
 *
 * Full-suite jsdom runs have been flaky when this helper mixed low-level
 * pointer events with separate user-event instances, so prefer the keyboard
 * path first and fall back to click-based interactions using the same user.
 */
const openRowActionsMenu = async (
  row: HTMLElement,
  user = userEvent.setup(),
) => {
  const rowIdentityText =
    within(row)
      .queryAllByRole("cell")
      .map((cell) => cell.textContent?.trim())
      .find((text) => Boolean(text)) ?? null

  const getCurrentRow = () => {
    if (!rowIdentityText) {
      return row
    }

    return (screen.queryByText(rowIdentityText)?.closest("tr") ??
      row) as HTMLElement
  }

  const getTrigger = () =>
    within(getCurrentRow()).getByRole("button", {
      name: "managedSiteChannels:table.columns.actions",
    })

  const hasRowActionContent = () => getOpenRowActionItem() !== null
  const isMenuOpen = () =>
    getTrigger().getAttribute("aria-expanded") === "true" ||
    screen.queryByRole("menu") !== null ||
    hasRowActionContent()
  const resetHalfOpenMenu = async () => {
    if (!isMenuOpen()) {
      return
    }

    const trigger = getTrigger()
    trigger.focus()
    await user.keyboard("{Escape}")

    try {
      await waitFor(
        () => {
          expect(isMenuOpen()).toBe(false)
        },
        { timeout: 1000 },
      )
    } catch {
      return
    }
  }

  const openAttempts = [
    async () => {
      const trigger = getTrigger()
      trigger.focus()
      await user.keyboard("{ArrowDown}")
    },
    async () => {
      await user.click(getTrigger())
    },
    async () => {
      const trigger = getTrigger()
      trigger.focus()
      await user.keyboard("{Enter}")
    },
    async () => {
      const trigger = getTrigger()
      trigger.focus()
      await user.keyboard("{Space}")
    },
  ]

  for (const attempt of openAttempts) {
    if (hasRowActionContent()) {
      return
    }

    await attempt()
    try {
      await waitFor(
        () => {
          expect(hasRowActionContent()).toBe(true)
        },
        { timeout: 1000 },
      )
      return
    } catch {
      await resetHalfOpenMenu()
    }
  }

  await waitFor(() => {
    expect(hasRowActionContent()).toBe(true)
  })
}

describe("ManagedSiteChannels", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchChannelFilters).mockResolvedValue([])
  })

  const buildPreferences = (options?: {
    managedSiteType?: string
    withMigrationTarget?: boolean
  }) => {
    const managedSiteType = options?.managedSiteType ?? NEW_API

    return {
      managedSiteType,
      newApi: {
        baseUrl: "https://admin.example",
        adminToken: "new-api-token",
        userId: "1",
        username: "admin",
        password: "secret-password",
        totpSecret: "JBSWY3DPEHPK3PXP",
      },
      doneHub:
        options?.withMigrationTarget || managedSiteType === DONE_HUB
          ? {
              baseUrl: "https://donehub.example",
              adminToken: "donehub-token",
              userId: "9",
            }
          : {
              baseUrl: "",
              adminToken: "",
              userId: "",
            },
      veloera:
        managedSiteType === VELOERA
          ? {
              baseUrl: "https://veloera.example",
              adminToken: "veloera-token",
              userId: "5",
            }
          : {
              baseUrl: "",
              adminToken: "",
              userId: "",
            },
      octopus:
        managedSiteType === OCTOPUS
          ? {
              baseUrl: "https://octopus.example",
              username: "octopus-admin",
              password: "octopus-password",
            }
          : {
              baseUrl: "",
              username: "",
              password: "",
            },
      axonHub:
        managedSiteType === AXON_HUB
          ? {
              baseUrl: "https://axonhub.example",
              email: "admin@example.com",
              password: "axonhub-password",
            }
          : {
              baseUrl: "",
              email: "",
              password: "",
            },
      claudeCodeHub:
        managedSiteType === CLAUDE_CODE_HUB
          ? {
              baseUrl: "https://cch.example",
              adminToken: "cch-token",
            }
          : {
              baseUrl: "",
              adminToken: "",
            },
    }
  }

  const mockChannels = (
    channels: any[],
    options?: {
      managedSiteType?: string
      messagesKey?: string
      withMigrationTarget?: boolean
      fetchChannelSecretKey?: (...args: unknown[]) => Promise<string>
    },
  ) => {
    const managedSiteType = options?.managedSiteType ?? NEW_API
    const messagesKey =
      options?.messagesKey ??
      (managedSiteType === DONE_HUB
        ? "donehub"
        : managedSiteType === VELOERA
          ? "veloera"
          : managedSiteType === AXON_HUB
            ? "axonhub"
            : managedSiteType === CLAUDE_CODE_HUB
              ? "claudecodehub"
              : "newapi")
    const preferences = buildPreferences({
      managedSiteType,
      withMigrationTarget: options?.withMigrationTarget,
    })

    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences,
      managedSiteType,
      newApiBaseUrl: preferences.newApi.baseUrl,
      newApiUserId: preferences.newApi.userId,
      newApiUsername: preferences.newApi.username,
      newApiPassword: preferences.newApi.password,
      newApiTotpSecret: preferences.newApi.totpSecret,
    } as any)

    vi.mocked(getManagedSiteService).mockResolvedValue({
      siteType: managedSiteType,
      messagesKey,
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://admin.example",
        token: "t",
        userId: "1",
      }),
      fetchChannelSecretKey: options?.fetchChannelSecretKey,
    } as any)

    vi.mocked(sendRuntimeMessage).mockResolvedValue({
      success: true,
      data: { items: channels },
    } as any)

    vi.mocked(isNewApiVerifiedSessionActive).mockReturnValue(true)
    vi.mocked(ensureNewApiManagedSession).mockResolvedValue({
      status: NEW_API_MANAGED_SESSION_STATUSES.VERIFIED,
      methods: {
        twoFactorEnabled: true,
        passkeyEnabled: false,
      },
    } as any)

    vi.mocked(getManagedSiteServiceForType).mockReturnValue({
      siteType: DONE_HUB,
      messagesKey: "donehub",
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://donehub.example",
        token: "donehub-token",
        userId: "9",
      }),
      buildChannelPayload: vi.fn((draft: any) => ({
        mode: "single",
        channel: {
          name: draft.name,
          key: draft.key,
        },
      })),
      createChannel: vi.fn().mockResolvedValue({
        success: true,
        message: "ok",
      }),
    } as any)
  }

  it("syncs routeParams.search into the search box and filters rows", async () => {
    mockChannels([
      { id: 1, name: "Alpha", base_url: "https://site-a.example" },
      { id: 2, name: "Beta", base_url: "https://site-b.example" },
    ])

    render(<ManagedSiteChannels routeParams={{ search: "site-a" }} />)

    await waitForRowText("Alpha")

    const input = screen.getByRole("textbox") as HTMLInputElement
    expect(input.value).toBe("site-a")

    await waitFor(() => {
      expect(screen.queryByText("Beta")).not.toBeInTheDocument()
    })
  })

  it("uses routeParams.channelId to focus a channel and restores the full list when cleared", async () => {
    mockChannels([
      { id: 1, name: "Alpha", base_url: "https://site-a.example" },
      { id: 21, name: "Twenty One", base_url: "https://site-b.example" },
    ])

    render(<ManagedSiteChannels routeParams={{ channelId: "21" }} />)

    await waitForRowText("Twenty One")

    const input = screen.getByRole("textbox") as HTMLInputElement
    expect(input.value).toBe("21")

    await waitFor(() => {
      expect(screen.queryByText("Alpha")).not.toBeInTheDocument()
    })

    fireEvent.change(input, { target: { value: "" } })

    await waitFor(() => {
      expect(screen.getByText("Alpha")).toBeInTheDocument()
      expect(navigateWithinOptionsPage).toHaveBeenCalledWith(
        "#managedSiteChannels",
        {},
      )
    })
  })

  it("sorts channels by id descending by default", async () => {
    mockChannels([
      { id: 1, name: "Alpha", base_url: "https://alpha.example" },
      { id: 3, name: "Gamma", base_url: "https://gamma.example" },
      { id: 2, name: "Beta", base_url: "https://beta.example" },
    ])

    const { container } = render(<ManagedSiteChannels />)

    await waitForRowText("Gamma")

    const rows = Array.from(container.querySelectorAll("tbody tr"))
    const names = rows.map((row) =>
      row.querySelector("td:nth-child(3) .font-medium")?.textContent?.trim(),
    )

    expect(names).toEqual(["Gamma", "Beta", "Alpha"])
  })

  it("reloads the channel list when the managed site type changes", async () => {
    let currentManagedSiteType = NEW_API
    let currentPreferences = buildPreferences({
      managedSiteType: currentManagedSiteType,
      withMigrationTarget: true,
    })
    let resolveDoneHubChannels:
      | ((value: {
          success: boolean
          data: {
            items: Array<{
              id: number
              name: string
              base_url: string
            }>
          }
        }) => void)
      | undefined

    vi.mocked(useUserPreferencesContext).mockImplementation(
      () =>
        ({
          preferences: currentPreferences,
          managedSiteType: currentManagedSiteType,
          newApiBaseUrl: currentPreferences.newApi.baseUrl,
          newApiUserId: currentPreferences.newApi.userId,
          newApiUsername: currentPreferences.newApi.username,
          newApiPassword: currentPreferences.newApi.password,
          newApiTotpSecret: currentPreferences.newApi.totpSecret,
          updateManagedSiteType: vi.fn().mockResolvedValue(true),
        }) as any,
    )

    vi.mocked(getManagedSiteService).mockImplementation(
      async () =>
        ({
          siteType: currentManagedSiteType,
          messagesKey:
            currentManagedSiteType === DONE_HUB ? "donehub" : "newapi",
          getConfig: vi.fn().mockResolvedValue({
            baseUrl:
              currentManagedSiteType === DONE_HUB
                ? "https://donehub.example"
                : "https://admin.example",
            token: "token",
            userId: "1",
          }),
        }) as any,
    )

    vi.mocked(sendRuntimeMessage)
      .mockResolvedValueOnce({
        success: true,
        data: {
          items: [{ id: 1, name: "Alpha", base_url: "https://site-a.example" }],
        },
      } as any)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveDoneHubChannels = resolve
          }),
      )

    const { rerender } = render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")

    currentManagedSiteType = DONE_HUB
    currentPreferences = buildPreferences({
      managedSiteType: currentManagedSiteType,
      withMigrationTarget: true,
    })

    rerender(<ManagedSiteChannels />)

    await waitFor(() => {
      expect(sendRuntimeMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          action: RuntimeActionIds.ModelSyncListChannels,
        }),
      )
      expect(screen.queryByText("Alpha")).not.toBeInTheDocument()
      expect(
        screen.getByText("managedSiteChannels:table.loading"),
      ).toBeInTheDocument()
    })

    resolveDoneHubChannels?.({
      success: true,
      data: {
        items: [{ id: 2, name: "Beta", base_url: "https://site-b.example" }],
      },
    })

    await waitFor(() => {
      expect(screen.getByText("Beta")).toBeInTheDocument()
      expect(screen.queryByText("Alpha")).not.toBeInTheDocument()
    })
  })

  it("reloads the channel list when refreshKey changes to a truthy value", async () => {
    mockChannels([{ id: 1, name: "Alpha", base_url: "https://alpha.example" }])
    vi.mocked(sendRuntimeMessage)
      .mockResolvedValueOnce({
        success: true,
        data: {
          items: [{ id: 1, name: "Alpha", base_url: "https://alpha.example" }],
        },
      } as any)
      .mockResolvedValueOnce({
        success: true,
        data: {
          items: [{ id: 2, name: "Beta", base_url: "https://beta.example" }],
        },
      } as any)

    const { rerender } = render(<ManagedSiteChannels refreshKey={0} />)

    await waitForRowText("Alpha")

    rerender(<ManagedSiteChannels refreshKey={1} />)

    await waitFor(() => {
      expect(screen.getByText("Beta")).toBeInTheDocument()
      expect(screen.queryByText("Alpha")).not.toBeInTheDocument()
    })

    expect(vi.mocked(sendRuntimeMessage)).toHaveBeenCalledTimes(2)
  })

  it("keeps the current channel rows visible while a manual refresh is loading", async () => {
    const user = userEvent.setup()
    let resolveRefresh:
      | ((value: { success: boolean; data: { items: any[] } }) => void)
      | undefined

    mockChannels([{ id: 1, name: "Alpha", base_url: "https://alpha.example" }])
    vi.mocked(sendRuntimeMessage)
      .mockResolvedValueOnce({
        success: true,
        data: {
          items: [{ id: 1, name: "Alpha", base_url: "https://alpha.example" }],
        },
      } as any)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRefresh = resolve as typeof resolveRefresh
          }) as any,
      )

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")

    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.refresh",
      }),
    )

    await waitFor(() => {
      expect(vi.mocked(sendRuntimeMessage)).toHaveBeenCalledTimes(2)
    })

    expect(screen.getByText("Alpha")).toBeInTheDocument()

    resolveRefresh?.({
      success: true,
      data: {
        items: [{ id: 2, name: "Beta", base_url: "https://beta.example" }],
      },
    })

    await waitFor(() => {
      expect(screen.getByText("Beta")).toBeInTheDocument()
    })
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument()
  })

  it("keeps row selection attached to the same channel after refreshed rows reorder", async () => {
    const user = userEvent.setup()
    let resolveRefresh:
      | ((value: { success: boolean; data: { items: any[] } }) => void)
      | undefined

    mockChannels([
      { id: 1, name: "Alpha", base_url: "https://alpha.example" },
      { id: 2, name: "Beta", base_url: "https://beta.example" },
    ])
    vi.mocked(sendRuntimeMessage)
      .mockResolvedValueOnce({
        success: true,
        data: {
          items: [
            { id: 1, name: "Alpha", base_url: "https://alpha.example" },
            { id: 2, name: "Beta", base_url: "https://beta.example" },
          ],
        },
      } as any)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRefresh = resolve as typeof resolveRefresh
          }) as any,
      )

    render(<ManagedSiteChannels />)

    await waitForRowText("Beta")
    await waitForChannelsRefreshIdle()

    const betaRow = screen.getByText("Beta").closest("tr")
    expect(betaRow).toBeTruthy()

    await user.click(
      within(betaRow!).getByRole("checkbox", {
        name: "managedSiteChannels:table.selectRow",
      }),
    )

    await waitFor(() => {
      const currentBetaRow = screen.getByText("Beta").closest("tr")
      expect(currentBetaRow).toBeTruthy()
      expect(
        within(currentBetaRow!).getByRole("checkbox", {
          name: "managedSiteChannels:table.selectRow",
        }),
      ).toBeChecked()
    })

    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.refresh",
      }),
    )

    resolveRefresh?.({
      success: true,
      data: {
        items: [
          { id: 2, name: "Beta", base_url: "https://beta.example" },
          { id: 3, name: "Gamma", base_url: "https://gamma.example" },
        ],
      },
    })

    await waitForRowText("Gamma")

    const refreshedBetaRow = screen.getByText("Beta").closest("tr")
    const gammaRow = screen.getByText("Gamma").closest("tr")
    expect(refreshedBetaRow).toBeTruthy()
    expect(gammaRow).toBeTruthy()

    expect(
      within(refreshedBetaRow!).getByRole("checkbox", {
        name: "managedSiteChannels:table.selectRow",
      }),
    ).toBeChecked()
    expect(
      within(gammaRow!).getByRole("checkbox", {
        name: "managedSiteChannels:table.selectRow",
      }),
    ).not.toBeChecked()
  })

  it("shows a config warning and skips the channel query when managed-site config is missing", async () => {
    const preferences = buildPreferences({ managedSiteType: NEW_API })
    preferences.newApi = {
      ...preferences.newApi,
      baseUrl: "",
      adminToken: "",
      userId: "",
    }

    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences,
      managedSiteType: NEW_API,
      newApiBaseUrl: preferences.newApi.baseUrl,
      newApiUserId: preferences.newApi.userId,
      newApiUsername: preferences.newApi.username,
      newApiPassword: preferences.newApi.password,
      newApiTotpSecret: preferences.newApi.totpSecret,
    } as any)

    render(<ManagedSiteChannels />)

    expect(
      await screen.findByText("common:status.configurationRequired"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("messages:newapi.configMissing"),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "common:actions.goToSettings" }),
    ).toBeInTheDocument()
    expect(sendRuntimeMessage).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()

    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.goToSettings" }),
    )

    expect(openSettingsTab).toHaveBeenCalledWith("managedSite", {
      preserveHistory: true,
    })
  })

  it("shows a load error alert when fetching channels fails", async () => {
    mockChannels([])
    vi.mocked(sendRuntimeMessage).mockResolvedValue({
      success: false,
      error: "backend exploded",
    } as any)

    render(<ManagedSiteChannels />)

    await waitFor(
      () => {
        expect(
          screen.getByText("managedSiteChannels:alerts.loadError.title"),
        ).toBeInTheDocument()
      },
      { timeout: 3000 },
    )
    expect(toast.error).toHaveBeenCalledWith(
      "managedSiteChannels:alerts.loadError.description",
    )
    expect(sendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.ModelSyncListChannels,
    })
  })

  it("renders base_url as a clickable link", async () => {
    mockChannels([{ id: 1, name: "Alpha", base_url: "https://click.me" }])

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")

    const link = screen.getByRole("link", { name: "https://click.me" })
    expect(link.getAttribute("href")).toMatch(/^https:\/\/click\.me\/?$/)
  })

  it("updates the options URL search param when the search input changes", async () => {
    mockChannels([{ id: 1, name: "Alpha", base_url: "https://example.com" }])

    render(<ManagedSiteChannels routeParams={{}} />)

    await waitForRowText("Alpha")

    const input = screen.getByRole("textbox") as HTMLInputElement
    fireEvent.change(input, { target: { value: "foo" } })

    await waitFor(() => {
      expect(navigateWithinOptionsPage).toHaveBeenCalledWith(
        "#managedSiteChannels",
        { search: "foo" },
      )
    })
  })

  it("does not push a duplicate search navigation when the route param already matches", async () => {
    mockChannels([{ id: 1, name: "Alpha", base_url: "https://example.com" }])

    render(<ManagedSiteChannels routeParams={{ search: "Alpha" }} />)

    await waitForRowText("Alpha")

    const input = screen.getByRole("textbox") as HTMLInputElement
    fireEvent.change(input, { target: { value: "Alpha" } })

    expect(navigateWithinOptionsPage).not.toHaveBeenCalled()
  })

  it("clears the search input from the dedicated clear button", async () => {
    const user = userEvent.setup()

    mockChannels([{ id: 1, name: "Alpha", base_url: "https://example.com" }])

    render(<ManagedSiteChannels routeParams={{ search: "Alpha" }} />)

    await waitForRowText("Alpha")

    const input = screen.getByRole("textbox") as HTMLInputElement
    expect(input.value).toBe("Alpha")

    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.clearSearch",
      }),
    )

    await waitFor(() => {
      expect(input.value).toBe("")
      expect(navigateWithinOptionsPage).toHaveBeenCalledWith(
        "#managedSiteChannels",
        {},
      )
    })
  })

  it("filters rows by status from the toolbar and shows the active filter count", async () => {
    const user = userEvent.setup()

    mockChannels([
      { id: 1, name: "Alpha", base_url: "https://alpha.example", status: 1 },
      { id: 2, name: "Beta", base_url: "https://beta.example", status: 2 },
    ])

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")
    await waitForRowText("Beta")

    const statusButton = screen.getByRole("button", {
      name: "managedSiteChannels:toolbar.status",
    })

    await user.click(statusButton)
    await user.click(
      await screen.findByRole("checkbox", {
        name: "managedSiteChannels:statusLabels.manualPause",
      }),
    )

    await waitFor(() => {
      expect(screen.queryByText("Alpha")).not.toBeInTheDocument()
    })

    expect(screen.getByText("Beta")).toBeInTheDocument()
    expect(statusButton).toHaveTextContent("(1)")
  })

  it("clears the last active status filter when the same option is unchecked", async () => {
    const user = userEvent.setup()

    mockChannels([
      { id: 1, name: "Alpha", base_url: "https://alpha.example", status: 1 },
      { id: 2, name: "Beta", base_url: "https://beta.example", status: 2 },
    ])

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")
    await waitForRowText("Beta")

    const statusButton = screen.getByRole("button", {
      name: "managedSiteChannels:toolbar.status",
    })

    await user.click(statusButton)

    const manualPauseCheckbox = await screen.findByRole("checkbox", {
      name: "managedSiteChannels:statusLabels.manualPause",
    })

    await user.click(manualPauseCheckbox)

    await waitFor(() => {
      expect(screen.queryByText("Alpha")).not.toBeInTheDocument()
      expect(screen.getByText("Beta")).toBeInTheDocument()
    })
    expect(statusButton).toHaveTextContent("(1)")

    await user.click(manualPauseCheckbox)

    await waitFor(() => {
      expect(screen.getByText("Alpha")).toBeInTheDocument()
      expect(screen.getByText("Beta")).toBeInTheDocument()
    })
    expect(statusButton).not.toHaveTextContent("(1)")
  })

  it("uses Octopus-specific column visibility and type labels", async () => {
    mockChannels(
      [
        {
          id: 1,
          name: "Alpha",
          base_url: "https://octopus.example",
          type: 1,
          models: "gpt-4o,gpt-4o-mini",
          group: "default",
          status: 1,
          priority: 8,
          weight: 5,
        },
      ],
      { managedSiteType: OCTOPUS },
    )

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")
    const row = screen.getByText("Alpha").closest("tr")

    expect(row).toBeTruthy()

    expect(
      screen.queryByText("managedSiteChannels:table.columns.group"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("managedSiteChannels:table.columns.priority"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("managedSiteChannels:table.columns.weight"),
    ).not.toBeInTheDocument()
    expect(screen.getByText("OpenAI Response")).toBeInTheDocument()
    expect(within(row!).getByText("2")).toBeInTheDocument()
  })

  it("uses AxonHub-specific columns, string type labels, row actions, and migration availability", async () => {
    const user = userEvent.setup()

    mockChannels(
      [
        {
          id: 1,
          name: "Alpha",
          base_url: "https://axon-source.example",
          type: "anthropic_aws",
          models: "claude-3-5-sonnet,gpt-4o",
          group: "default",
          key: "test-key",
          status: 1,
          priority: 8,
          weight: 5,
        },
      ],
      { managedSiteType: AXON_HUB },
    )

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")

    expect(
      screen.queryByText("managedSiteChannels:table.columns.group"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("managedSiteChannels:table.columns.priority"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("managedSiteChannels:table.columns.weight"),
    ).not.toBeInTheDocument()
    expect(screen.getByText("Anthropic AWS")).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: /managedSiteChannels:toolbar.enterMigrationMode/,
      }),
    ).toBeInTheDocument()

    const row = screen.getByText("Alpha").closest("tr")
    expect(row).toBeTruthy()
    expect(within(row!).getByText("2")).toBeInTheDocument()
    await user.click(
      within(row!).getByRole("button", {
        name: "managedSiteChannels:table.columns.actions",
      }),
    )

    expect(
      await screen.findByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.edit",
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.filters",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.openSync",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.sync",
      }),
    ).not.toBeInTheDocument()
  })

  it("toggles hideable columns from the toolbar menu without closing the menu", async () => {
    const user = userEvent.setup()

    mockChannels([
      {
        id: 1,
        name: "Alpha",
        base_url: "https://alpha.example",
        status: 1,
      },
    ])

    const { container } = render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")

    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.columns",
      }),
    )

    const statusToggle = await screen.findByRole("menuitemcheckbox", {
      name: "managedSiteChannels:table.columns.status",
    })
    expect(statusToggle).toHaveAttribute("data-state", "checked")

    await user.click(statusToggle)

    await waitFor(() => {
      const table = container.querySelector("table")
      expect(table).toBeTruthy()
      expect(
        within(table as HTMLTableElement).queryByText(
          "managedSiteChannels:table.columns.status",
        ),
      ).not.toBeInTheDocument()
    })

    expect(
      screen.getByRole("menuitemcheckbox", {
        name: "managedSiteChannels:table.columns.status",
      }),
    ).toBeInTheDocument()
  })

  it("opens the row actions menu from the trigger", async () => {
    mockChannels([
      { id: 1, name: "Alpha", base_url: "https://example.com", key: "k" },
    ])

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")

    const row = screen.getByText("Alpha").closest("tr")
    expect(row).toBeTruthy()

    await openRowActionsMenu(row!)

    expect(
      await screen.findByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.edit",
      }),
    ).toBeInTheDocument()
  })

  it("sends a targeted sync request from row actions and reports backend failures", async () => {
    const user = userEvent.setup()
    const channels = [
      { id: 1, name: "Alpha", base_url: "https://alpha.example", key: "a" },
    ]

    mockChannels(channels)
    vi.mocked(sendRuntimeMessage).mockImplementation(async (payload: any) => {
      if (payload.action === RuntimeActionIds.ModelSyncListChannels) {
        return {
          success: true,
          data: { items: channels },
        } as any
      }

      if (payload.action === RuntimeActionIds.ModelSyncTriggerSelected) {
        return {
          success: false,
          error: "sync failed",
        } as any
      }

      return { success: true } as any
    })

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")

    const row = screen.getByText("Alpha").closest("tr")
    expect(row).toBeTruthy()
    await openRowActionsMenu(row!, user)

    await user.click(
      await screen.findByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.sync",
      }),
    )

    await waitFor(() => {
      expect(sendRuntimeMessage).toHaveBeenCalledWith({
        action: RuntimeActionIds.ModelSyncTriggerSelected,
        channelIds: [1],
      })
    })

    expect(toast.error).toHaveBeenCalledWith(
      "managedSiteChannels:toasts.syncFailed",
    )
  })

  it("opens the per-channel model sync view from row actions", async () => {
    const user = userEvent.setup()

    mockChannels([
      { id: 1, name: "Alpha", base_url: "https://alpha.example", key: "a" },
    ])

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")

    const row = screen.getByText("Alpha").closest("tr")
    expect(row).toBeTruthy()
    await openRowActionsMenu(row!, user)

    await user.click(
      await screen.findByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.openSync",
      }),
    )

    expect(openManagedSiteModelSyncForChannel).toHaveBeenCalledWith(1)
  })

  it("opens the filter dialog from row actions and loads channel-specific filters", async () => {
    const user = userEvent.setup()

    mockChannels([
      { id: 1, name: "Alpha", base_url: "https://alpha.example", key: "a" },
    ])

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")

    const row = screen.getByText("Alpha").closest("tr")
    expect(row).toBeTruthy()
    await openRowActionsMenu(row!, user)

    await user.click(
      await screen.findByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.filters",
      }),
    )

    const dialog = await screen.findByRole("dialog")
    expect(
      within(dialog).getByText("managedSiteChannels:filters.title"),
    ).toBeInTheDocument()

    await waitFor(() => {
      expect(fetchChannelFilters).toHaveBeenCalledWith(1)
    })
  })

  it("opens the row-action delete flow for a single channel", async () => {
    const user = userEvent.setup()
    const deleteChannel = vi.fn().mockResolvedValue({ success: true })

    mockChannels([
      { id: 1, name: "Alpha", base_url: "https://alpha.example", key: "a" },
    ])

    vi.mocked(getManagedSiteService).mockResolvedValue({
      siteType: NEW_API,
      messagesKey: "newapi",
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://admin.example",
        token: "t",
        userId: "1",
      }),
      deleteChannel,
    } as any)

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")

    const row = screen.getByText("Alpha").closest("tr")
    expect(row).toBeTruthy()
    await openRowActionsMenu(row!, user)

    await user.click(
      await screen.findByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.delete",
      }),
    )

    const dialog = await screen.findByRole("dialog")
    expect(
      within(dialog).getByText("managedSiteChannels:dialog.deleteTitle"),
    ).toBeInTheDocument()

    await user.click(
      within(dialog).getByRole("button", {
        name: "managedSiteChannels:dialog.confirm",
      }),
    )

    await waitFor(() => {
      expect(deleteChannel).toHaveBeenCalledWith(
        "https://admin.example",
        "t",
        "1",
        1,
      )
    })

    await waitFor(() => {
      expect(screen.queryByText("Alpha")).not.toBeInTheDocument()
    })

    expect(toast.success).toHaveBeenCalledWith(
      "managedSiteChannels:toasts.channelDeleted",
    )
  })

  it("removes successfully deleted channels and reports partial delete failures", async () => {
    const user = userEvent.setup()

    mockChannels([
      { id: 1, name: "Alpha", base_url: "https://alpha.example", key: "a" },
      { id: 2, name: "Beta", base_url: "https://beta.example", key: "b" },
    ])

    const deleteChannel = vi
      .fn()
      .mockImplementation(
        (
          _baseUrl: string,
          _token: string,
          _userId: string,
          channelId: number,
        ) =>
          channelId === 1
            ? Promise.resolve({ success: true })
            : Promise.reject(new Error("delete beta failed")),
      )

    vi.mocked(getManagedSiteService).mockResolvedValue({
      siteType: NEW_API,
      messagesKey: "newapi",
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://admin.example",
        token: "t",
        userId: "1",
      }),
      deleteChannel,
    } as any)

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")
    await waitForRowText("Beta")

    const alphaRow = screen.getByText("Alpha").closest("tr")
    const betaRow = screen.getByText("Beta").closest("tr")
    expect(alphaRow).toBeTruthy()
    expect(betaRow).toBeTruthy()

    await user.click(
      within(alphaRow!).getByRole("checkbox", {
        name: "managedSiteChannels:table.selectRow",
      }),
    )
    await user.click(
      within(betaRow!).getByRole("checkbox", {
        name: "managedSiteChannels:table.selectRow",
      }),
    )

    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.deleteSelected",
      }),
    )

    const dialog = await screen.findByRole("dialog")
    expect(
      within(dialog).getByText("managedSiteChannels:dialog.deleteTitlePlural"),
    ).toBeInTheDocument()

    await user.click(
      within(dialog).getByRole("button", {
        name: "managedSiteChannels:dialog.confirm",
      }),
    )

    await waitFor(() => {
      expect(deleteChannel).toHaveBeenCalledTimes(2)
    })

    await waitFor(() => {
      expect(screen.queryByText("Alpha")).not.toBeInTheDocument()
    })

    expect(screen.getByText("Beta")).toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith(
      "managedSiteChannels:toasts.channelDeleted",
    )
    expect(toast.error).toHaveBeenCalledWith("delete beta failed")
  })

  it("syncs the selected rows from the toolbar", async () => {
    const user = userEvent.setup()
    const channels = [
      { id: 1, name: "Alpha", base_url: "https://alpha.example", key: "a" },
      { id: 2, name: "Beta", base_url: "https://beta.example", key: "b" },
    ]

    mockChannels(channels)
    vi.mocked(sendRuntimeMessage).mockImplementation(async (payload: any) => {
      if (payload.action === RuntimeActionIds.ModelSyncListChannels) {
        return {
          success: true,
          data: { items: channels },
        } as any
      }

      if (payload.action === RuntimeActionIds.ModelSyncTriggerSelected) {
        return {
          success: true,
          data: {
            statistics: {
              successCount: 1,
            },
          },
        } as any
      }

      return { success: true } as any
    })

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")
    await waitForRowText("Beta")

    const alphaRow = screen.getByText("Alpha").closest("tr")
    const betaRow = screen.getByText("Beta").closest("tr")
    expect(alphaRow).toBeTruthy()
    expect(betaRow).toBeTruthy()

    await user.click(
      within(alphaRow!).getByRole("checkbox", {
        name: "managedSiteChannels:table.selectRow",
      }),
    )
    await user.click(
      within(betaRow!).getByRole("checkbox", {
        name: "managedSiteChannels:table.selectRow",
      }),
    )

    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.syncSelected",
      }),
    )

    await waitFor(() => {
      expect(sendRuntimeMessage).toHaveBeenCalledWith({
        action: RuntimeActionIds.ModelSyncTriggerSelected,
        channelIds: [1, 2],
      })
    })

    expect(toast.success).toHaveBeenCalledWith(
      "managedSiteChannels:toasts.syncCompleted",
    )
  })

  it("uses the select-all checkbox to open a migration preview for the whole page", async () => {
    const user = userEvent.setup()

    mockChannels(
      [
        { id: 1, name: "Alpha", base_url: "https://alpha.example", key: "a" },
        { id: 2, name: "Beta", base_url: "https://beta.example", key: "b" },
      ],
      { withMigrationTarget: true },
    )

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")
    await waitForRowText("Beta")

    await user.click(
      screen.getByRole("button", {
        name: /managedSiteChannels:toolbar.enterMigrationMode/,
      }),
    )

    await user.click(
      screen.getByRole("checkbox", {
        name: "managedSiteChannels:table.selectAll",
      }),
    )

    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.migrateSelected",
      }),
    )

    const dialog = await screen.findByRole("dialog")
    expect(
      within(dialog).getByText("managedSiteChannels:migration.title"),
    ).toBeInTheDocument()
    expect(within(dialog).getByText("Alpha")).toBeInTheDocument()
    expect(within(dialog).getByText("Beta")).toBeInTheDocument()
  })

  it("loads the real channel key from the edit dialog", async () => {
    const user = userEvent.setup()
    let resolveRealKey: ((key: string) => void) | undefined
    mockChannels([
      {
        id: 208,
        name: "Alpha",
        base_url: "https://example.com",
        type: 1,
        models: "gpt-4o",
        group: "default",
        status: 1,
        priority: 0,
        weight: 0,
        key: "",
      },
    ])
    vi.mocked(fetchNewApiChannelKey).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRealKey = resolve
        }),
    )

    render(
      <>
        <ManagedSiteChannels />
        <ChannelDialogContainer />
      </>,
    )

    await waitForRowText("Alpha")

    const row = screen.getByText("Alpha").closest("tr")
    expect(row).toBeTruthy()
    await openRowActionsMenu(row!, user)

    const editItem = await screen.findByRole("menuitem", {
      name: "managedSiteChannels:table.rowActions.edit",
    })
    await user.click(editItem)

    const loadRealKeyButton = await screen.findByRole("button", {
      name: "channelDialog:actions.loadRealKey",
    })
    await user.click(loadRealKeyButton)

    await waitFor(() => {
      expect(fetchNewApiChannelKey).toHaveBeenCalledWith({
        baseUrl: "https://admin.example",
        userId: "1",
        username: "admin",
        password: "secret-password",
        totpSecret: "JBSWY3DPEHPK3PXP",
        channelId: 208,
      })
    })

    expect(
      screen.getByRole("button", {
        name: "channelDialog:actions.loadingRealKey",
      }),
    ).toBeDisabled()

    resolveRealKey?.("sk-real-channel-key")

    await waitFor(() => {
      expect(
        screen.getByDisplayValue("sk-real-channel-key"),
      ).toBeInTheDocument()
    })
  })

  it("ignores stale real-key responses after reopening the dialog for another channel", async () => {
    const user = userEvent.setup()
    let resolveFirstRealKey: ((key: string) => void) | undefined

    mockChannels([
      {
        id: 208,
        name: "Alpha",
        base_url: "https://example.com/alpha",
        type: 1,
        models: "gpt-4o",
        group: "default",
        status: 1,
        priority: 0,
        weight: 0,
        key: "",
      },
      {
        id: 209,
        name: "Beta",
        base_url: "https://example.com/beta",
        type: 1,
        models: "gpt-4o-mini",
        group: "default",
        status: 1,
        priority: 0,
        weight: 0,
        key: "",
      },
    ])

    vi.mocked(fetchNewApiChannelKey).mockImplementation(({ channelId }) => {
      if (channelId === 208) {
        return new Promise((resolve) => {
          resolveFirstRealKey = resolve
        })
      }

      return Promise.resolve("sk-beta-channel-key")
    })

    render(
      <>
        <ManagedSiteChannels />
        <ChannelDialogContainer />
      </>,
    )

    await waitForRowText("Alpha")
    await waitForRowText("Beta")

    const alphaRow = screen.getByText("Alpha").closest("tr")
    expect(alphaRow).toBeTruthy()
    await openRowActionsMenu(alphaRow!, user)

    await user.click(
      await screen.findByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.edit",
      }),
    )

    await user.click(
      await screen.findByRole("button", {
        name: "channelDialog:actions.loadRealKey",
      }),
    )

    await waitFor(() => {
      expect(fetchNewApiChannelKey).toHaveBeenCalledWith({
        baseUrl: "https://admin.example",
        userId: "1",
        username: "admin",
        password: "secret-password",
        totpSecret: "JBSWY3DPEHPK3PXP",
        channelId: 208,
      })
    })

    await user.click(
      screen.getByRole("button", {
        name: "common:actions.cancel",
      }),
    )

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })

    const betaRow = screen.getByText("Beta").closest("tr")
    expect(betaRow).toBeTruthy()
    await openRowActionsMenu(betaRow!, user)

    await user.click(
      await screen.findByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.edit",
      }),
    )

    resolveFirstRealKey?.("sk-stale-alpha-key")

    const keyInput = await screen.findByPlaceholderText(
      "channelDialog:fields.key.placeholder",
    )

    await waitFor(() => {
      expect(keyInput).toHaveValue("")
      expect(
        screen.queryByDisplayValue("sk-stale-alpha-key"),
      ).not.toBeInTheDocument()
    })
  })

  it.each([
    [DONE_HUB, "donehub"],
    [VELOERA, "veloera"],
  ])(
    "loads the real channel key from the edit dialog for %s",
    async (managedSiteType, messagesKey) => {
      const user = userEvent.setup()
      const fetchChannelSecretKey = vi
        .fn()
        .mockResolvedValue("sk-real-channel-key")

      mockChannels(
        [
          {
            id: 308,
            name: "Alpha",
            base_url: "https://example.com",
            type: 1,
            models: "gpt-4o",
            group: "default",
            status: 1,
            priority: 0,
            weight: 0,
            key: "",
          },
        ],
        {
          managedSiteType,
          messagesKey,
          fetchChannelSecretKey,
        },
      )

      render(
        <>
          <ManagedSiteChannels />
          <ChannelDialogContainer />
        </>,
      )

      await waitForRowText("Alpha")

      const row = screen.getByText("Alpha").closest("tr")
      expect(row).toBeTruthy()
      await openRowActionsMenu(row!, user)

      await user.click(
        await screen.findByRole("menuitem", {
          name: "managedSiteChannels:table.rowActions.edit",
        }),
      )

      await user.click(
        await screen.findByRole("button", {
          name: "channelDialog:actions.loadRealKey",
        }),
      )

      await waitFor(() => {
        expect(fetchChannelSecretKey).toHaveBeenCalledWith(
          "https://admin.example",
          "t",
          "1",
          308,
        )
      })

      await waitFor(() => {
        expect(
          screen.getByDisplayValue("sk-real-channel-key"),
        ).toBeInTheDocument()
      })
    },
  )

  it("hides the migration entry when no target is configured", async () => {
    mockChannels(
      [{ id: 1, name: "Alpha", base_url: "https://example.com", key: "k" }],
      { withMigrationTarget: false },
    )

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")

    expect(
      screen.queryByRole("button", {
        name: /managedSiteChannels:toolbar.enterMigrationMode/,
      }),
    ).not.toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalledWith(
      "managedSiteChannels:migration.alerts.noTargets.description",
    )
  })

  it("keeps the migration exit action available when targets disappear", async () => {
    const user = userEvent.setup()
    let currentPreferences = buildPreferences({
      managedSiteType: NEW_API,
      withMigrationTarget: true,
    })

    vi.mocked(useUserPreferencesContext).mockImplementation(
      () =>
        ({
          preferences: currentPreferences,
          managedSiteType: NEW_API,
          newApiBaseUrl: currentPreferences.newApi.baseUrl,
          newApiUserId: currentPreferences.newApi.userId,
          newApiUsername: currentPreferences.newApi.username,
          newApiPassword: currentPreferences.newApi.password,
          newApiTotpSecret: currentPreferences.newApi.totpSecret,
        }) as any,
    )
    vi.mocked(sendRuntimeMessage).mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            id: 1,
            name: "Alpha",
            base_url: "https://example.com",
            key: "k",
          },
        ],
      },
    } as any)

    const { rerender } = render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")
    await user.click(
      screen.getByRole("button", {
        name: /managedSiteChannels:toolbar.enterMigrationMode/,
      }),
    )

    expect(
      screen.getByRole("button", {
        name: /managedSiteChannels:toolbar.exitMigrationMode/,
      }),
    ).toBeInTheDocument()

    currentPreferences = buildPreferences({
      managedSiteType: NEW_API,
      withMigrationTarget: false,
    })
    rerender(<ManagedSiteChannels />)

    await user.click(
      screen.getByRole("button", {
        name: /managedSiteChannels:toolbar.exitMigrationMode/,
      }),
    )

    expect(
      screen.queryByRole("button", {
        name: /managedSiteChannels:toolbar.exitMigrationMode/,
      }),
    ).not.toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalledWith(
      "managedSiteChannels:migration.alerts.noTargets.description",
    )
  })

  it("shows the migration entry when a target is configured", async () => {
    mockChannels(
      [{ id: 1, name: "Alpha", base_url: "https://example.com", key: "k" }],
      { withMigrationTarget: true },
    )

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")

    const entry = screen.getByRole("button", {
      name: /managedSiteChannels:toolbar.enterMigrationMode/,
    })
    expect(entry).toBeInTheDocument()
    expect(
      within(entry).getByText("managedSiteChannels:migration.betaBadge"),
    ).toBeInTheDocument()
  })

  it("offers AxonHub migration entry points while hiding New API-only actions", async () => {
    const user = userEvent.setup()

    mockChannels(
      [
        {
          id: 1,
          name: "Axon Alpha",
          base_url: "https://axon-source.example",
          key: "axon-key",
          type: AXON_HUB_CHANNEL_TYPE.ANTHROPIC,
          models: "claude-3-5-sonnet",
          status: 1,
          weight: 0,
        },
      ],
      {
        managedSiteType: AXON_HUB,
        messagesKey: "axonhub",
        withMigrationTarget: true,
      },
    )

    render(<ManagedSiteChannels />)

    await waitForRowText("Axon Alpha")

    expect(
      screen.getByRole("button", {
        name: /managedSiteChannels:toolbar.enterMigrationMode/,
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "managedSiteChannels:toolbar.syncSelected",
      }),
    ).not.toBeInTheDocument()

    const row = screen.getByText("Axon Alpha").closest("tr")
    expect(row).toBeTruthy()
    await user.click(
      within(row!).getByRole("button", {
        name: "managedSiteChannels:table.columns.actions",
      }),
    )

    expect(
      await screen.findByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.edit",
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.filters",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.openSync",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.sync",
      }),
    ).not.toBeInTheDocument()

    await user.keyboard("{Escape}")
    await user.click(
      screen.getByRole("button", {
        name: /managedSiteChannels:toolbar.enterMigrationMode/,
      }),
    )

    expect(
      screen.getByRole("button", {
        name: /managedSiteChannels:toolbar.exitMigrationMode/,
      }),
    ).toBeInTheDocument()

    await user.click(
      within(row!).getByRole("checkbox", {
        name: "managedSiteChannels:table.selectRow",
      }),
    )
    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.migrateSelected",
      }),
    )

    const dialog = await screen.findByRole("dialog")
    expect(
      within(dialog).getByText("managedSiteChannels:migration.title"),
    ).toBeInTheDocument()
    expect(within(dialog).getByText("Axon Alpha")).toBeInTheDocument()
  })

  it("offers Claude Code Hub migration entry points while hiding unsupported managed-site actions", async () => {
    const user = userEvent.setup()

    mockChannels(
      [
        {
          id: 101,
          name: "Claude Provider",
          base_url: "https://cch-source.example",
          key: "sk-********",
          type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
          models: "claude-3-5-sonnet",
          status: 1,
          weight: 1,
        },
      ],
      {
        managedSiteType: CLAUDE_CODE_HUB,
        messagesKey: "claudecodehub",
        withMigrationTarget: true,
      },
    )

    render(
      <>
        <ManagedSiteChannels />
        <ChannelDialogContainer />
      </>,
    )

    await waitForRowText("Claude Provider")

    expect(
      screen.getByText("Claude (Anthropic Messages API)"),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: /managedSiteChannels:toolbar.enterMigrationMode/,
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "managedSiteChannels:toolbar.syncSelected",
      }),
    ).not.toBeInTheDocument()

    const row = screen.getByText("Claude Provider").closest("tr")
    expect(row).toBeTruthy()
    await openRowActionsMenu(row!, user)

    expect(
      await screen.findByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.edit",
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.filters",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.openSync",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.sync",
      }),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.edit",
      }),
    )
    const editDialog = await screen.findByRole("dialog")
    expect(
      within(editDialog).queryByRole("button", {
        name: "channelDialog:actions.loadRealKey",
      }),
    ).not.toBeInTheDocument()

    await user.click(
      within(editDialog).getByText("common:actions.cancel", {
        selector: "button",
      }),
    )

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })

    await user.click(
      screen.getByRole("button", {
        name: /managedSiteChannels:toolbar.enterMigrationMode/,
      }),
    )
    await user.click(
      within(row!).getByRole("checkbox", {
        name: "managedSiteChannels:table.selectRow",
      }),
    )
    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.migrateSelected",
      }),
    )

    const migrationDialog = await screen.findByRole("dialog")
    expect(
      within(migrationDialog).getByText("managedSiteChannels:migration.title"),
    ).toBeInTheDocument()
    expect(
      within(migrationDialog).getByText("Claude Provider"),
    ).toBeInTheDocument()
  })

  it("keeps refresh and read-only channel viewing available in migration mode", async () => {
    const user = userEvent.setup()

    mockChannels(
      [
        { id: 1, name: "Alpha", base_url: "https://alpha.example", key: "a" },
        { id: 2, name: "Beta", base_url: "https://beta.example", key: "b" },
      ],
      { withMigrationTarget: true },
    )

    render(
      <>
        <ManagedSiteChannels />
        <ChannelDialogContainer />
      </>,
    )

    await waitForRowText("Alpha")
    await waitForRowText("Beta")
    const initialRequestCount = vi.mocked(sendRuntimeMessage).mock.calls.length

    expect(
      screen.queryByRole("button", {
        name: "managedSiteChannels:toolbar.migrateSelected",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.refresh",
      }),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: /managedSiteChannels:toolbar.enterMigrationMode/,
      }),
    )

    expect(
      screen.getByRole("button", {
        name: /managedSiteChannels:toolbar.exitMigrationMode/,
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.migrateSelected",
      }),
    ).toBeInTheDocument()
    const refreshButton = screen.getByRole("button", {
      name: "managedSiteChannels:toolbar.refresh",
    })
    expect(refreshButton).toBeInTheDocument()

    await user.click(refreshButton)

    await waitFor(() => {
      expect(sendRuntimeMessage).toHaveBeenCalledTimes(initialRequestCount + 1)
    })

    const betaRow = screen.getByText("Beta").closest("tr")
    expect(betaRow).toBeTruthy()
    await openRowActionsMenu(betaRow!, user)

    expect(
      await screen.findByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.view",
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.edit",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.openSync",
      }),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.view",
      }),
    )

    const viewDialog = await screen.findByRole("dialog")
    expect(
      within(viewDialog).getByText("channelDialog:title.view"),
    ).toBeInTheDocument()
    expect(screen.getByDisplayValue("Beta")).toBeInTheDocument()
    expect(
      within(viewDialog).getByText("common:actions.close", {
        selector: "button",
      }),
    ).toBeInTheDocument()
    expect(
      within(viewDialog).queryByRole("button", {
        name: "channelDialog:actions.update",
      }),
    ).not.toBeInTheDocument()
    expect(
      within(viewDialog).queryByRole("button", {
        name: "channelDialog:actions.loadRealKey",
      }),
    ).not.toBeInTheDocument()

    await user.click(
      within(viewDialog).getByText("common:actions.close", {
        selector: "button",
      }),
    )

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })

    await openRowActionsMenu(betaRow!, user)

    await user.click(
      await screen.findByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.migrate",
      }),
    )

    const dialog = await screen.findByRole("dialog")
    expect(
      within(dialog).getByText("managedSiteChannels:migration.title"),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText("managedSiteChannels:migration.betaBadge"),
    ).toBeInTheDocument()
    expect(within(dialog).getByText("Beta")).toBeInTheDocument()

    const betaDetailsToggle = within(dialog).getByText("Beta").closest("button")
    expect(betaDetailsToggle).toBeTruthy()

    await user.click(betaDetailsToggle!)

    expect(
      within(dialog).getByText("channelDialog:fields.priority.label"),
    ).toBeInTheDocument()
  })

  it("uses filtered rows for migrate filtered and shows an execution summary", async () => {
    const user = userEvent.setup()

    mockChannels(
      [
        {
          id: 1,
          name: "Alpha",
          base_url: "https://site-a.example",
          key: "alpha-key",
          type: 1,
          models: "gpt-4o",
          group: "default",
          status: 1,
          priority: 0,
          weight: 0,
        },
        {
          id: 2,
          name: "Beta",
          base_url: "https://site-b.example",
          key: "beta-key",
          type: 1,
          models: "gpt-4o-mini",
          group: "default",
          status: 1,
          priority: 0,
          weight: 0,
        },
      ],
      { withMigrationTarget: true },
    )

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")
    await waitForRowText("Beta")

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "site-a" },
    })

    await waitFor(() => {
      expect(screen.queryByText("Beta")).not.toBeInTheDocument()
    })

    await user.click(
      screen.getByRole("button", {
        name: /managedSiteChannels:toolbar.enterMigrationMode/,
      }),
    )

    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.migrateFiltered",
      }),
    )

    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("Alpha")).toBeInTheDocument()
    expect(within(dialog).queryByText("Beta")).not.toBeInTheDocument()

    await user.click(
      within(dialog).getByRole("button", {
        name: "managedSiteChannels:migration.actions.start",
      }),
    )

    await user.click(
      await screen.findByRole("button", {
        name: "managedSiteChannels:migration.confirm.confirm",
      }),
    )

    await waitFor(() => {
      expect(
        within(dialog).getByText("managedSiteChannels:migration.results.title"),
      ).toBeInTheDocument()
    })
    expect(
      within(dialog).getByLabelText(
        "managedSiteChannels:migration.target.label",
      ),
    ).toBeDisabled()
    expect(
      within(dialog).getByRole("button", {
        name: "managedSiteChannels:migration.actions.refreshPreview",
      }),
    ).toBeDisabled()

    expect(getManagedSiteServiceForType).toHaveBeenCalledWith("done-hub")
  })

  it("updates pagination controls when the rows-per-page size changes", async () => {
    const user = userEvent.setup()

    mockChannels(
      Array.from({ length: 30 }, (_, index) => ({
        id: index + 1,
        name: `Channel ${index + 1}`,
        base_url: `https://site-${index + 1}.example`,
      })),
    )

    render(<ManagedSiteChannels />)

    await waitForRowText("Channel 30")
    expect(screen.queryByText("Channel 12")).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("combobox", {
        name: "managedSiteChannels:table.rowsPerPage",
      }),
    )
    await user.click(screen.getByRole("option", { name: "25" }))

    await waitFor(() => {
      expect(screen.getByText("Channel 12")).toBeInTheDocument()
      expect(screen.queryByText("Channel 5")).not.toBeInTheDocument()
    })

    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:table.paginationNext",
      }),
    )

    await waitFor(() => {
      expect(screen.getByText("Channel 5")).toBeInTheDocument()
      expect(screen.queryByText("Channel 12")).not.toBeInTheDocument()
    })

    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:table.paginationPrev",
      }),
    )

    await waitFor(() => {
      expect(screen.getByText("Channel 12")).toBeInTheDocument()
      expect(screen.queryByText("Channel 5")).not.toBeInTheDocument()
    })
  })

  it("lets the user cancel the delete dialog before deletion starts", async () => {
    const user = userEvent.setup()

    mockChannels([
      { id: 1, name: "Alpha", base_url: "https://alpha.example", key: "a" },
    ])

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")
    await waitForChannelsRefreshIdle()

    const getAlphaRow = () => screen.getByText("Alpha").closest("tr")

    await waitFor(() => {
      expect(getAlphaRow()).toBeTruthy()
    })

    await user.click(
      within(getAlphaRow()!).getByRole("checkbox", {
        name: "managedSiteChannels:table.selectRow",
      }),
    )

    await waitFor(() => {
      expect(
        within(getAlphaRow()!).getByRole("checkbox", {
          name: "managedSiteChannels:table.selectRow",
        }),
      ).toBeChecked()
    })

    const getDeleteSelectedButton = () =>
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.deleteSelected",
      })

    await waitFor(() => {
      expect(getDeleteSelectedButton()).toBeEnabled()
    })

    await user.click(getDeleteSelectedButton())

    const dialog = await screen.findByRole("dialog")
    expect(
      within(dialog).getByText("managedSiteChannels:dialog.deleteTitle"),
    ).toBeInTheDocument()

    await user.click(
      within(dialog).getByRole("button", {
        name: "managedSiteChannels:dialog.cancel",
      }),
    )

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })

    expect(screen.getByText("Alpha")).toBeInTheDocument()
  })

  it("reports a config-missing error when deletion is confirmed after config becomes unavailable", async () => {
    const user = userEvent.setup()
    const deleteChannel = vi.fn()

    mockChannels([
      { id: 1, name: "Alpha", base_url: "https://alpha.example", key: "a" },
    ])

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")
    await waitForChannelsRefreshIdle()

    const getAlphaRow = () => screen.getByText("Alpha").closest("tr")

    await waitFor(() => {
      expect(getAlphaRow()).toBeTruthy()
    })

    await user.click(
      within(getAlphaRow()!).getByRole("checkbox", {
        name: "managedSiteChannels:table.selectRow",
      }),
    )

    await waitFor(() => {
      expect(
        within(getAlphaRow()!).getByRole("checkbox", {
          name: "managedSiteChannels:table.selectRow",
        }),
      ).toBeChecked()
    })

    const getDeleteSelectedButton = () =>
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.deleteSelected",
      })

    await waitFor(() => {
      expect(getDeleteSelectedButton()).toBeEnabled()
    })

    await user.click(getDeleteSelectedButton())

    const dialog = await screen.findByRole("dialog")

    vi.mocked(getManagedSiteService).mockResolvedValue({
      siteType: NEW_API,
      messagesKey: "newapi",
      getConfig: vi.fn().mockResolvedValue(null),
      deleteChannel,
    } as any)

    await user.click(
      within(dialog).getByRole("button", {
        name: "managedSiteChannels:dialog.confirm",
      }),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("messages:newapi.configMissing")
    })
    expect(deleteChannel).not.toHaveBeenCalled()
    expect(screen.getByText("Alpha")).toBeInTheDocument()
  })
})
