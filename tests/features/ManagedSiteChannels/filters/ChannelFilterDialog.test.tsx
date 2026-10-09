import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import ChannelFilterDialog from "~/features/ManagedSiteChannels/filters/ChannelFilterDialog"
import {
  fetchChannelFilterSettings,
  saveChannelFilters,
} from "~/features/ManagedSiteChannels/filters/channelFilters"
import toast from "~/lib/notify"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_EDITOR_MODES,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { createManagedUpstreamResourceRef } from "~/types/managedUpstreamResource"
import { createDeferred } from "~~/tests/test-utils/deferred"
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "~~/tests/test-utils/render"

const {
  mockFetchChannelFilterSettings,
  mockSaveChannelFilters,
  mockStartProductAnalyticsAction,
  mockCompleteProductAnalyticsAction,
} = vi.hoisted(() => ({
  mockFetchChannelFilterSettings: vi.fn(),
  mockSaveChannelFilters: vi.fn(),
  mockStartProductAnalyticsAction: vi.fn(),
  mockCompleteProductAnalyticsAction: vi.fn(),
}))

vi.mock("~/lib/notify", () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock("~/features/ManagedSiteChannels/filters/channelFilters", () => ({
  fetchChannelFilterSettings: mockFetchChannelFilterSettings,
  saveChannelFilters: mockSaveChannelFilters,
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: (...args: any[]) =>
    mockStartProductAnalyticsAction(...args),
}))

vi.mock("~/utils/core/identifier", () => ({
  safeRandomUUID: vi.fn(() => "generated-filter-id"),
}))

vi.mock("~/components/ui", async () => ({
  ...(await vi.importActual("~/components/ui/ActionGroup")),
  Modal: ({
    isOpen,
    children,
    footer,
    header,
  }: {
    isOpen: boolean
    children: ReactNode
    footer?: ReactNode
    header?: ReactNode
  }) =>
    isOpen ? (
      <div role="dialog">
        {header}
        {children}
        {footer}
      </div>
    ) : null,
}))

vi.mock("~/components/ui/button", () => ({
  Button: ({
    analyticsAction,
    children,
    onClick,
    disabled,
  }: {
    analyticsAction?: {
      featureId: string
      actionId: string
      surfaceId: string
      entrypoint: string
    }
    children: ReactNode
    onClick?: () => void
    disabled?: boolean
  }) => (
    <button
      data-analytics-action={
        analyticsAction
          ? `${analyticsAction.featureId}:${analyticsAction.actionId}:${analyticsAction.surfaceId}:${analyticsAction.entrypoint}`
          : undefined
      }
      disabled={disabled}
      onClick={() => onClick?.()}
    >
      {children}
    </button>
  ),
}))

vi.mock("~/features/ManagedSiteModelSync/filters/ChannelFiltersEditor", () => ({
  default: ({
    filters,
    viewMode,
    jsonText,
    isLoading,
    probeRulesSupported,
    onAddFilter,
    onMoveFilter,
    onRemoveFilter,
    onFieldChange,
    onClickViewVisual,
    onClickViewJson,
    onChangeJsonText,
  }: any) => (
    <div>
      <div data-testid="view-mode">{viewMode}</div>
      <div data-testid="loading-state">{String(Boolean(isLoading))}</div>
      <div data-testid="filter-count">{filters.length}</div>
      <div data-testid="first-filter-name">{filters[0]?.name ?? ""}</div>
      <div data-testid="probe-rules-supported">
        {String(Boolean(probeRulesSupported))}
      </div>
      <button onClick={onAddFilter}>add-filter</button>
      <button onClick={() => onAddFilter("probe")}>add-probe-filter</button>
      <button onClick={() => filters[0] && onMoveFilter(filters[0].id, "down")}>
        move-first-down
      </button>
      <button onClick={() => filters[0] && onRemoveFilter(filters[0].id)}>
        remove-filter
      </button>
      <button onClick={onClickViewJson}>view-json</button>
      <button onClick={onClickViewVisual}>view-visual</button>
      <button
        onClick={() =>
          filters[0] && onFieldChange(filters[0].id, "name", "Rule")
        }
      >
        set-first-name
      </button>
      <button
        onClick={() =>
          filters[0] && onFieldChange(filters[0].id, "pattern", "[")
        }
      >
        set-invalid-pattern
      </button>
      <button
        onClick={() =>
          filters[0] && onFieldChange(filters[0].id, "pattern", "  gpt  ")
        }
      >
        set-valid-pattern
      </button>
      <button
        onClick={() =>
          filters[0] &&
          onFieldChange(filters[0].id, "description", "  keep chat models  ")
        }
      >
        set-description
      </button>
      <button
        onClick={() =>
          filters[0] && onFieldChange(filters[0].id, "isRegex", true)
        }
      >
        enable-regex
      </button>
      <button
        onClick={() =>
          filters[0] && onFieldChange(filters[0].id, "action", "exclude")
        }
      >
        set-exclude
      </button>
      <button
        onClick={() =>
          filters[0] && onFieldChange(filters[0].id, "enabled", false)
        }
      >
        disable-filter
      </button>
      <textarea
        aria-label="json-text"
        value={jsonText}
        onChange={(event) => onChangeJsonText(event.target.value)}
      />
    </div>
  ),
}))

const mockedFetchChannelFilterSettings =
  fetchChannelFilterSettings as unknown as ReturnType<typeof vi.fn>
const mockedSaveChannelFilters = saveChannelFilters as unknown as ReturnType<
  typeof vi.fn
>

const sampleResourceRef = createManagedUpstreamResourceRef({
  managedSiteType: "axonhub",
  scopeKey: "https://admin.example.invalid",
  resourceId: "provider/native-id",
})

const sampleChannel = {
  name: "Alpha",
  type: "midjourney",
  resourceRef: sampleResourceRef,
} as any

const sampleStorageIdentity = {
  resourceRef: sampleResourceRef,
}

describe("ChannelFilterDialog", () => {
  it("keeps the draft when its parent rerenders with a new close callback", async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <ChannelFilterDialog channel={sampleChannel} open onClose={vi.fn()} />,
    )
    const toggle = await screen.findByRole("switch")
    await waitFor(() => expect(toggle).toBeEnabled())
    await user.click(toggle)
    rerender(
      <ChannelFilterDialog channel={sampleChannel} open onClose={vi.fn()} />,
    )
    await waitFor(() => expect(toggle).toBeEnabled())
    expect(toggle).toBeChecked()
    expect(mockedFetchChannelFilterSettings).toHaveBeenCalledTimes(1)
  })

  it("does not overwrite participation when an exclusion draft returns to its loaded value", async () => {
    const user = userEvent.setup()
    mockedFetchChannelFilterSettings.mockResolvedValue({
      filters: [],
      modelSyncExcluded: true,
    })
    render(
      <ChannelFilterDialog channel={sampleChannel} open onClose={vi.fn()} />,
    )
    const toggle = await screen.findByRole("switch")
    await waitFor(() => expect(toggle).toBeChecked())
    await user.click(toggle)
    expect(toggle).not.toBeChecked()
    await user.click(toggle)
    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:filters.actions.save",
      }),
    )
    expect(mockedSaveChannelFilters).toHaveBeenCalledWith(
      sampleStorageIdentity,
      [],
      {},
    )
  })

  it("retains the draft after a failed save and retries re-enabling automatic sync", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const saving = createDeferred<void>()
    mockedFetchChannelFilterSettings.mockResolvedValue({
      filters: [],
      modelSyncExcluded: true,
    })
    mockedSaveChannelFilters.mockReturnValueOnce(saving.promise)
    render(
      <ChannelFilterDialog channel={sampleChannel} open onClose={onClose} />,
    )
    const toggle = await screen.findByRole("switch")
    await waitFor(() => expect(toggle).toBeChecked())
    await user.click(toggle)
    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:filters.actions.save",
      }),
    )
    expect(toggle).toBeDisabled()
    expect(
      screen.getByRole("button", {
        name: "managedSiteChannels:filters.actions.cancel",
      }),
    ).toBeDisabled()
    await act(async () => saving.reject(new Error("write failed")))
    expect(onClose).not.toHaveBeenCalled()
    expect(toggle).not.toBeChecked()
    expect(toggle).toBeEnabled()
    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:filters.actions.save",
      }),
    )
    expect(mockedSaveChannelFilters).toHaveBeenLastCalledWith(
      sampleStorageIdentity,
      [],
      { modelSyncExcluded: false },
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it.each(["resolve", "reject"] as const)(
    "ignores a stale load that completes with %s after changing channels",
    async (outcome) => {
      const oldLoad = createDeferred<{
        filters: []
        modelSyncExcluded: boolean
      }>()
      mockedFetchChannelFilterSettings.mockReturnValueOnce(oldLoad.promise)
      const onClose = vi.fn()
      const { rerender } = render(
        <ChannelFilterDialog channel={sampleChannel} open onClose={onClose} />,
      )
      await screen.findByRole("switch")
      const nextChannel = {
        ...sampleChannel,
        name: "Beta",
        resourceRef: { ...sampleResourceRef, resourceId: "other" },
      }
      rerender(
        <ChannelFilterDialog channel={nextChannel} open onClose={onClose} />,
      )
      await waitFor(() => expect(screen.getByRole("switch")).toBeEnabled())
      await act(async () => {
        if (outcome === "resolve")
          oldLoad.resolve({ filters: [], modelSyncExcluded: true })
        else oldLoad.reject(new Error("old load failed"))
      })
      expect(screen.getByRole("switch")).not.toBeChecked()
      expect(onClose).not.toHaveBeenCalled()
      expect(toast.error).not.toHaveBeenCalled()
    },
  )

  it("does not close the next channel editor when a previous save completes", async () => {
    const user = userEvent.setup()
    const saving = createDeferred<void>()
    mockedSaveChannelFilters.mockReturnValueOnce(saving.promise)
    const onClose = vi.fn()
    const { rerender } = render(
      <ChannelFilterDialog channel={sampleChannel} open onClose={onClose} />,
    )
    const toggle = await screen.findByRole("switch")
    await waitFor(() => expect(toggle).toBeEnabled())
    await user.click(toggle)
    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:filters.actions.save",
      }),
    )
    const nextChannel = {
      ...sampleChannel,
      name: "Beta",
      resourceRef: { ...sampleResourceRef, resourceId: "other" },
    }
    rerender(
      <ChannelFilterDialog channel={nextChannel} open onClose={onClose} />,
    )
    await waitFor(() => expect(screen.getByRole("switch")).toBeEnabled())
    await act(async () => saving.resolve())
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole("switch")).not.toBeChecked()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it("offers a draft exclusion in both editor modes and saves it with filters", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <ChannelFilterDialog channel={sampleChannel} open onClose={onClose} />,
    )
    const toggle = await screen.findByRole("switch", {
      name: "managedSiteModelSync:execution.exclusions.title",
    })
    await waitFor(() => expect(toggle).toBeEnabled())
    await user.click(toggle)
    expect(toggle).toBeChecked()
    expect(mockedSaveChannelFilters).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "view-json" }))
    expect(toggle).toBeVisible()
    expect(toggle).toBeChecked()
    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:filters.actions.save",
      }),
    )
    await waitFor(() =>
      expect(mockedSaveChannelFilters).toHaveBeenCalledWith(
        sampleStorageIdentity,
        [],
        { modelSyncExcluded: true },
      ),
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("discards an exclusion draft on cancel and reloads it on reopen", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { rerender } = render(
      <ChannelFilterDialog channel={sampleChannel} open onClose={onClose} />,
    )
    const toggle = await screen.findByRole("switch")
    await waitFor(() => expect(toggle).toBeEnabled())
    toggle.focus()
    await user.keyboard(" ")
    expect(toggle).toBeChecked()
    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:filters.actions.cancel",
      }),
    )
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(mockedSaveChannelFilters).not.toHaveBeenCalled()
    rerender(
      <ChannelFilterDialog
        channel={sampleChannel}
        open={false}
        onClose={onClose}
      />,
    )
    rerender(
      <ChannelFilterDialog channel={sampleChannel} open onClose={onClose} />,
    )
    await waitFor(() => expect(screen.getByRole("switch")).toBeEnabled())
    expect(screen.getByRole("switch")).not.toBeChecked()
  })

  it("blocks save and exclusion edits until settings finish loading", async () => {
    mockedFetchChannelFilterSettings.mockReturnValue(new Promise(() => {}))
    render(
      <ChannelFilterDialog channel={sampleChannel} open onClose={vi.fn()} />,
    )
    expect(
      await screen.findByRole("button", {
        name: "managedSiteChannels:filters.actions.save",
      }),
    ).toBeDisabled()
    expect(screen.getByRole("switch")).toBeDisabled()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000)
    mockedFetchChannelFilterSettings.mockResolvedValue({
      filters: [],
      modelSyncExcluded: false,
    })
    mockedSaveChannelFilters.mockResolvedValue(undefined)
    mockStartProductAnalyticsAction.mockReturnValue({
      complete: mockCompleteProductAnalyticsAction,
    })
  })

  it("loads existing filters when opened", async () => {
    mockedFetchChannelFilterSettings.mockResolvedValue({
      modelSyncExcluded: false,
      filters: [
        {
          id: "rule-1",
          name: "Allow GPT",
          description: "keep chat models",
          pattern: "gpt",
          isRegex: false,
          action: "include",
          enabled: true,
          createdAt: 100,
          updatedAt: 200,
        },
      ],
    })

    render(
      <ChannelFilterDialog
        channel={sampleChannel}
        open={true}
        onClose={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(mockedFetchChannelFilterSettings).toHaveBeenCalledWith(
        sampleStorageIdentity,
      )
    })

    await waitFor(() => {
      expect(screen.getByTestId("filter-count")).toHaveTextContent("1")
    })

    expect(screen.getByLabelText("json-text")).toHaveValue(
      JSON.stringify(
        [
          {
            id: "rule-1",
            name: "Allow GPT",
            description: "keep chat models",
            pattern: "gpt",
            isRegex: false,
            action: "include",
            enabled: true,
            createdAt: 100,
            updatedAt: 200,
          },
        ],
        null,
        2,
      ),
    )
    expect(screen.getByTestId("probe-rules-supported")).toHaveTextContent(
      "false",
    )
  })

  it("passes resource identity from the channel row when available", async () => {
    const resourceChannel = {
      ...sampleChannel,
      resourceRef: sampleResourceRef,
    }

    render(
      <ChannelFilterDialog
        channel={resourceChannel}
        open={true}
        onClose={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(mockedFetchChannelFilterSettings).toHaveBeenCalledWith({
        resourceRef: sampleResourceRef,
      })
    })

    fireEvent.click(screen.getByRole("button", { name: "view-json" }))
    fireEvent.change(screen.getByLabelText("json-text"), {
      target: {
        value: JSON.stringify([
          {
            name: "Allow GPT",
            pattern: "gpt",
          },
        ]),
      },
    })
    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:filters.actions.save",
      }),
    )

    await waitFor(() => {
      expect(mockedSaveChannelFilters).toHaveBeenCalledWith(
        {
          resourceRef: sampleResourceRef,
        },
        [
          expect.objectContaining({
            name: "Allow GPT",
            pattern: "gpt",
          }),
        ],
        {},
      )
    })
  })

  it("shows an error toast and closes when filters fail to load", async () => {
    const onClose = vi.fn()
    mockedFetchChannelFilterSettings.mockRejectedValue(new Error("load failed"))

    render(
      <ChannelFilterDialog
        channel={sampleChannel}
        open={true}
        onClose={onClose}
      />,
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "managedSiteChannels:filters.messages.loadFailed",
      )
    })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("fails closed when a channel row has no resource identity", async () => {
    const onClose = vi.fn()

    render(
      <ChannelFilterDialog
        channel={{ ...sampleChannel, resourceRef: undefined }}
        open={true}
        onClose={onClose}
      />,
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "managedSiteChannels:filters.messages.loadFailed",
      )
    })
    expect(mockedFetchChannelFilterSettings).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("validates regex filters in visual mode before saving", async () => {
    render(
      <ChannelFilterDialog
        channel={sampleChannel}
        open={true}
        onClose={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId("loading-state")).toHaveTextContent("false")
    })

    fireEvent.click(screen.getByRole("button", { name: "add-filter" }))
    fireEvent.click(screen.getByRole("button", { name: "set-first-name" }))
    fireEvent.click(screen.getByRole("button", { name: "set-invalid-pattern" }))
    fireEvent.click(screen.getByRole("button", { name: "enable-regex" }))
    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:filters.actions.save",
      }),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "managedSiteChannels:filters.messages.validationRegex",
      )
    })

    expect(mockedSaveChannelFilters).not.toHaveBeenCalled()
  })

  it("does not declare static analytics metadata on the save button", async () => {
    render(
      <ChannelFilterDialog
        channel={sampleChannel}
        open={true}
        onClose={vi.fn()}
      />,
    )

    const saveButton = await screen.findByRole("button", {
      name: "managedSiteChannels:filters.actions.save",
    })

    expect(saveButton).not.toHaveAttribute("data-analytics-action")
  })

  it("parses and trims JSON filters before saving", async () => {
    const onClose = vi.fn()

    render(
      <ChannelFilterDialog
        channel={sampleChannel}
        open={true}
        onClose={onClose}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId("loading-state")).toHaveTextContent("false")
    })

    fireEvent.click(screen.getByRole("button", { name: "view-json" }))
    fireEvent.change(screen.getByLabelText("json-text"), {
      target: {
        value: JSON.stringify([
          {
            name: "  Allow GPT  ",
            description: "  keep chat models  ",
            pattern: "  ^gpt  ",
            isRegex: true,
            action: "exclude",
            enabled: false,
          },
        ]),
      },
    })

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:filters.actions.save",
      }),
    )

    await waitFor(() => {
      expect(mockedSaveChannelFilters).toHaveBeenCalledWith(
        sampleStorageIdentity,
        [
          {
            id: "generated-filter-id",
            name: "Allow GPT",
            description: "keep chat models",
            kind: "pattern",
            pattern: "^gpt",
            isRegex: true,
            action: "exclude",
            enabled: false,
            createdAt: 1_700_000_000_000,
            updatedAt: 1_700_000_000_000,
          },
        ],
        {},
      )
    })

    expect(toast.success).toHaveBeenCalledWith(
      "managedSiteChannels:filters.messages.saved",
    )
    expect(mockStartProductAnalyticsAction).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.SaveManagedSiteChannelModelFilters,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelFilterDialog,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      {
        insights: {
          editorMode: PRODUCT_ANALYTICS_EDITOR_MODES.Json,
          itemCount: 1,
        },
      },
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("normalizes visual-mode probe filters before saving", async () => {
    const onClose = vi.fn()

    render(
      <ChannelFilterDialog
        channel={{
          ...sampleChannel,
          type: "openai",
        }}
        open={true}
        onClose={onClose}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId("loading-state")).toHaveTextContent("false")
    })

    fireEvent.click(screen.getByRole("button", { name: "add-probe-filter" }))
    fireEvent.click(screen.getByRole("button", { name: "set-first-name" }))
    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:filters.actions.save",
      }),
    )

    await waitFor(() => {
      expect(mockedSaveChannelFilters).toHaveBeenCalledWith(
        sampleStorageIdentity,
        [
          expect.objectContaining({
            kind: "probe",
            name: "Rule",
            probeIds: ["text-generation"],
          }),
        ],
        {},
      )
    })

    expect(toast.success).toHaveBeenCalledWith(
      "managedSiteChannels:filters.messages.saved",
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("validates missing names for visual-mode probe filters before saving", async () => {
    const onClose = vi.fn()

    render(
      <ChannelFilterDialog
        channel={{
          ...sampleChannel,
          type: "openai",
        }}
        open={true}
        onClose={onClose}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId("loading-state")).toHaveTextContent("false")
    })

    fireEvent.click(screen.getByRole("button", { name: "add-probe-filter" }))
    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:filters.actions.save",
      }),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "managedSiteChannels:filters.messages.validationName",
      )
    })

    expect(mockedSaveChannelFilters).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(mockStartProductAnalyticsAction).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.SaveManagedSiteChannelModelFilters,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelFilterDialog,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
        insights: {
          editorMode: PRODUCT_ANALYTICS_EDITOR_MODES.Visual,
          failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Validation,
          itemCount: 1,
        },
      },
    )
  })

  it("shows a save error without closing when persistence fails", async () => {
    const onClose = vi.fn()
    mockedSaveChannelFilters.mockRejectedValue(new Error("persist failed"))

    render(
      <ChannelFilterDialog
        channel={sampleChannel}
        open={true}
        onClose={onClose}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId("loading-state")).toHaveTextContent("false")
    })

    fireEvent.click(screen.getByRole("button", { name: "view-json" }))
    fireEvent.change(screen.getByLabelText("json-text"), {
      target: {
        value: JSON.stringify([
          {
            name: "Allow GPT",
            pattern: "gpt",
          },
        ]),
      },
    })

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:filters.actions.save",
      }),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "managedSiteChannels:filters.messages.saveFailed",
      )
    })

    expect(onClose).not.toHaveBeenCalled()
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: {
          editorMode: PRODUCT_ANALYTICS_EDITOR_MODES.Json,
          failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Persist,
          itemCount: 1,
        },
      },
    )
  })

  it("preserves user-defined visual rule order when saving", async () => {
    const onClose = vi.fn()
    mockedFetchChannelFilterSettings.mockResolvedValue({
      modelSyncExcluded: false,
      filters: [
        {
          id: "rule-1",
          name: "First",
          description: "",
          pattern: "first",
          isRegex: false,
          action: "include",
          enabled: true,
          createdAt: 100,
          updatedAt: 200,
        },
        {
          id: "rule-2",
          name: "Second",
          description: "",
          pattern: "second",
          isRegex: false,
          action: "exclude",
          enabled: true,
          createdAt: 101,
          updatedAt: 201,
        },
      ],
    })

    render(
      <ChannelFilterDialog
        channel={sampleChannel}
        open={true}
        onClose={onClose}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId("filter-count")).toHaveTextContent("2")
    })

    fireEvent.click(screen.getByRole("button", { name: "move-first-down" }))
    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:filters.actions.save",
      }),
    )

    await waitFor(() => {
      expect(mockedSaveChannelFilters).toHaveBeenCalledWith(
        sampleStorageIdentity,
        [
          expect.objectContaining({
            id: "rule-2",
            name: "Second",
            pattern: "second",
          }),
          expect.objectContaining({
            id: "rule-1",
            name: "First",
            pattern: "first",
          }),
        ],
        {},
      )
    })

    expect(toast.success).toHaveBeenCalledWith(
      "managedSiteChannels:filters.messages.saved",
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("keeps JSON mode active and reports invalid JSON when switching back to visual", async () => {
    render(
      <ChannelFilterDialog
        channel={sampleChannel}
        open={true}
        onClose={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId("loading-state")).toHaveTextContent("false")
    })

    fireEvent.click(screen.getByRole("button", { name: "view-json" }))
    fireEvent.change(screen.getByLabelText("json-text"), {
      target: { value: "{invalid json" },
    })
    fireEvent.click(screen.getByRole("button", { name: "view-visual" }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "managedSiteChannels:filters.messages.jsonInvalid",
      )
    })

    expect(screen.getByTestId("view-mode")).toHaveTextContent("json")
  })
})
