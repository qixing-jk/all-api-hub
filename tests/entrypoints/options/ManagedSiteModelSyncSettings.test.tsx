import type { ReactNode } from "react"
import toast from "react-hot-toast"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import ManagedSiteModelSyncSettings from "~/features/BasicSettings/components/tabs/ManagedSite/managedSiteModelSyncSettings"
import { modelMetadataService } from "~/services/models/modelMetadata"
import { sendRuntimeMessage } from "~/utils/browser/browserApi"
import { pushWithinOptionsPage } from "~/utils/navigation"
import { fireEvent, render, screen, waitFor } from "~~/tests/test-utils/render"

const {
  mockedUseUserPreferencesContext,
  mockUpdateNewApiModelSync,
  mockResetNewApiModelSyncConfig,
} = vi.hoisted(() => ({
  mockedUseUserPreferencesContext: vi.fn(),
  mockUpdateNewApiModelSync: vi.fn(),
  mockResetNewApiModelSyncConfig: vi.fn(),
}))

vi.mock("~/contexts/UserPreferencesContext", async (importOriginal) => {
  const actual =
    (await importOriginal()) as typeof import("~/contexts/UserPreferencesContext")

  return {
    ...actual,
    UserPreferencesProvider: ({ children }: { children: ReactNode }) =>
      children,
    useUserPreferencesContext: () => mockedUseUserPreferencesContext(),
  }
})

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()

  return {
    ...actual,
    sendRuntimeMessage: vi.fn(),
  }
})

vi.mock("~/services/models/modelMetadata", () => ({
  modelMetadataService: {
    initialize: vi.fn(),
    getAllMetadata: vi.fn(),
  },
}))

vi.mock("~/utils/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/navigation")>()

  return {
    ...actual,
    pushWithinOptionsPage: vi.fn(),
  }
})

vi.mock("~/utils/core/identifier", () => ({
  safeRandomUUID: vi.fn(() => "generated-filter-id"),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock("~/components/SettingSection", () => ({
  SettingSection: ({
    children,
    title,
    description,
    onReset,
  }: {
    children: ReactNode
    title: string
    description: string
    onReset?: () => Promise<boolean>
  }) => (
    <section>
      <h2>{title}</h2>
      <p>{description}</p>
      <button onClick={() => void onReset?.()}>common:actions.reset</button>
      {children}
    </section>
  ),
}))

vi.mock("~/components/ChannelFiltersEditor", () => ({
  default: ({
    filters,
    viewMode,
    jsonText,
    onAddFilter,
    onRemoveFilter,
    onFieldChange,
    onChangeJsonText,
    onClickViewJson,
    onClickViewVisual,
  }: any) => (
    <div>
      <div data-testid="filter-view-mode">{viewMode}</div>
      <div data-testid="filter-count">{filters.length}</div>
      <button onClick={onAddFilter}>add-filter</button>
      <button onClick={() => filters[0] && onRemoveFilter(filters[0].id)}>
        remove-filter
      </button>
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
          filters[0] && onFieldChange(filters[0].id, "pattern", "^gpt")
        }
      >
        set-valid-pattern
      </button>
      <button
        onClick={() =>
          filters[0] && onFieldChange(filters[0].id, "isRegex", true)
        }
      >
        enable-regex
      </button>
      <button onClick={onClickViewJson}>view-json</button>
      <button onClick={onClickViewVisual}>view-visual</button>
      <textarea
        aria-label="json-text"
        value={jsonText}
        onChange={(event) => onChangeJsonText(event.target.value)}
      />
    </div>
  ),
}))

vi.mock("~/components/ui", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: ReactNode
    onClick?: () => void
    disabled?: boolean
  }) => (
    <button disabled={disabled} onClick={() => onClick?.()}>
      {children}
    </button>
  ),
  WorkflowTransitionButton: ({
    children,
    onClick,
    disabled,
  }: {
    children: ReactNode
    onClick?: () => void
    disabled?: boolean
  }) => (
    <button disabled={disabled} onClick={() => onClick?.()}>
      {children}
    </button>
  ),
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardItem: ({
    title,
    description,
    rightContent,
    children,
  }: {
    title?: ReactNode
    description?: ReactNode
    rightContent?: ReactNode
    children?: ReactNode
  }) => (
    <div>
      {title ? <div>{title}</div> : null}
      {description ? <div>{description}</div> : null}
      {rightContent}
      {children}
    </div>
  ),
  CardList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CompactMultiSelect: ({
    options,
    selected,
    onChange,
    disabled,
  }: {
    options: Array<{ label: string }>
    selected: string[]
    onChange?: (value: string[]) => void
    disabled?: boolean
  }) => (
    <div>
      <div data-testid="allowed-model-options">
        {options.map((option) => option.label).join(",")}
      </div>
      <div data-testid="allowed-model-selected">{selected.join(",")}</div>
      <button
        disabled={disabled}
        onClick={() => onChange?.(["gpt-4o", "claude-3-7-sonnet"])}
      >
        select-allowed-models
      </button>
    </div>
  ),
  Input: ({
    value,
    placeholder,
    onChange,
    type,
  }: {
    value?: string
    placeholder?: string
    type?: string
    onChange?: (event: { target: { value: string } }) => void
  }) => (
    <input
      aria-label={placeholder ?? type ?? "input"}
      value={value}
      onChange={(event) =>
        onChange?.({ target: { value: event.currentTarget.value } })
      }
      type={type}
    />
  ),
  Modal: ({
    isOpen,
    children,
    footer,
    header,
    onClose,
  }: {
    isOpen: boolean
    children: ReactNode
    footer?: ReactNode
    header?: ReactNode
    onClose?: () => void
  }) =>
    isOpen ? (
      <div role="dialog">
        <button onClick={() => onClose?.()}>modal-close</button>
        {header}
        {children}
        {footer}
      </div>
    ) : null,
  Switch: ({
    checked,
    onChange,
  }: {
    checked: boolean
    onChange?: (checked: boolean) => void
  }) => (
    <input
      aria-label="managed-site-sync-enabled"
      checked={checked}
      onChange={(event) => onChange?.(event.currentTarget.checked)}
      type="checkbox"
    />
  ),
}))

const mockedSendRuntimeMessage = sendRuntimeMessage as unknown as ReturnType<
  typeof vi.fn
>
const mockedModelMetadataService = modelMetadataService as unknown as {
  initialize: ReturnType<typeof vi.fn>
  getAllMetadata: ReturnType<typeof vi.fn>
}
const mockedPushWithinOptionsPage =
  pushWithinOptionsPage as unknown as ReturnType<typeof vi.fn>

const createContextValue = (overrides: Record<string, unknown> = {}) => ({
  preferences: {
    managedSiteModelSync: {
      enabled: true,
      interval: 24 * 60 * 60 * 1000,
      concurrency: 2,
      maxRetries: 2,
      rateLimit: { requestsPerMinute: 20, burst: 5 },
      allowedModels: ["existing-model"],
      globalChannelModelFilters: [],
    },
  },
  updateNewApiModelSync: mockUpdateNewApiModelSync,
  resetNewApiModelSyncConfig: mockResetNewApiModelSyncConfig,
  ...overrides,
})

const createDeferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

describe("ManagedSiteModelSyncSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockUpdateNewApiModelSync.mockResolvedValue(true)
    mockResetNewApiModelSyncConfig.mockResolvedValue(true)
    mockedUseUserPreferencesContext.mockReturnValue(createContextValue())

    mockedSendRuntimeMessage.mockResolvedValue({
      success: true,
      data: ["z-model", "a-model"],
    })

    mockedModelMetadataService.initialize.mockResolvedValue(undefined)
    mockedModelMetadataService.getAllMetadata.mockReturnValue([])
  })

  it("loads runtime model options and persists toggles, intervals, and allowed models", async () => {
    render(<ManagedSiteModelSyncSettings />)

    await waitFor(() => {
      expect(mockedSendRuntimeMessage).toHaveBeenCalledWith({
        action: RuntimeActionIds.ModelSyncGetChannelUpstreamModelOptions,
      })
    })

    expect(screen.getByTestId("allowed-model-options")).toHaveTextContent(
      "a-model,z-model",
    )
    expect(screen.getByTestId("allowed-model-selected")).toHaveTextContent(
      "existing-model",
    )

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "select-allowed-models" }),
      ).not.toBeDisabled()
    })

    fireEvent.click(
      screen.getByRole("checkbox", { name: "managed-site-sync-enabled" }),
    )

    await waitFor(() => {
      expect(mockUpdateNewApiModelSync).toHaveBeenCalledWith({ enabled: false })
    })

    fireEvent.click(
      screen.getByRole("button", { name: "select-allowed-models" }),
    )

    await waitFor(() => {
      expect(mockUpdateNewApiModelSync).toHaveBeenCalledWith({
        allowedModels: ["gpt-4o", "claude-3-7-sonnet"],
      })
    })

    const intervalInput = screen.getByDisplayValue("24")
    fireEvent.change(intervalInput, { target: { value: "12" } })

    await waitFor(() => {
      expect(mockUpdateNewApiModelSync).toHaveBeenCalledWith({
        interval: 12 * 60 * 60 * 1000,
      })
    })

    expect(mockUpdateNewApiModelSync).toHaveBeenCalledWith({
      enabled: false,
    })
    expect(toast.success).toHaveBeenCalledWith(
      "managedSiteModelSync:messages.success.settingsSaved",
    )
  })

  it("falls back to model metadata when runtime options are unavailable", async () => {
    mockedSendRuntimeMessage.mockResolvedValue({
      success: true,
      data: [],
    })
    mockedModelMetadataService.getAllMetadata.mockReturnValue([
      { id: "zeta-model" },
      { id: "alpha-model" },
    ])

    render(<ManagedSiteModelSyncSettings />)

    await waitFor(() => {
      expect(mockedModelMetadataService.initialize).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByTestId("allowed-model-options")).toHaveTextContent(
      "alpha-model,zeta-model",
    )
  })

  it("falls back to legacy newApiModelSync preferences when managedSiteModelSync is absent", async () => {
    mockedUseUserPreferencesContext.mockReturnValue(
      createContextValue({
        preferences: {
          newApiModelSync: {
            enabled: false,
            interval: 6 * 60 * 60 * 1000,
            concurrency: 4,
            maxRetries: 1,
            rateLimit: { requestsPerMinute: 35, burst: 9 },
            allowedModels: ["legacy-model"],
            globalChannelModelFilters: [
              {
                id: "legacy-filter",
                name: "Legacy",
                pattern: "^legacy",
                isRegex: true,
                action: "include",
                enabled: true,
                createdAt: 1,
                updatedAt: 1,
              },
            ],
          },
        },
      }),
    )

    render(<ManagedSiteModelSyncSettings />)

    await waitFor(() => {
      expect(mockedSendRuntimeMessage).toHaveBeenCalled()
    })

    expect(
      screen.getByRole("checkbox", { name: "managed-site-sync-enabled" }),
    ).not.toBeChecked()
    expect(screen.getByDisplayValue("6")).toBeInTheDocument()
    expect(screen.getByDisplayValue("4")).toBeInTheDocument()
    expect(screen.getByDisplayValue("1")).toBeInTheDocument()
    expect(screen.getByDisplayValue("35")).toBeInTheDocument()
    expect(screen.getByDisplayValue("9")).toBeInTheDocument()
    expect(screen.getByTestId("allowed-model-selected")).toHaveTextContent(
      "legacy-model",
    )
  })

  it("falls back to model metadata when the runtime response is unsuccessful", async () => {
    mockedSendRuntimeMessage.mockResolvedValue({
      success: false,
      error: "runtime unavailable",
    })
    mockedModelMetadataService.getAllMetadata.mockReturnValue([
      { id: "zeta-model" },
      { id: "alpha-model" },
    ])

    render(<ManagedSiteModelSyncSettings />)

    await waitFor(() => {
      expect(mockedModelMetadataService.initialize).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByTestId("allowed-model-options")).toHaveTextContent(
      "alpha-model,zeta-model",
    )
    expect(
      screen.queryByText(
        "managedSiteModelSync:settings.allowedModelsLoadFailed",
      ),
    ).not.toBeInTheDocument()
  })

  it("shows a load error when both runtime and metadata fallback fail", async () => {
    mockedSendRuntimeMessage.mockRejectedValue(new Error("runtime down"))

    render(<ManagedSiteModelSyncSettings />)

    await waitFor(() => {
      expect(
        screen.getByText(
          "managedSiteModelSync:settings.allowedModelsLoadFailed",
        ),
      ).toBeInTheDocument()
    })

    expect(screen.getByTestId("allowed-model-options")).toHaveTextContent("")
  })

  it("ignores invalid numeric values outside the supported ranges", async () => {
    render(<ManagedSiteModelSyncSettings />)

    await waitFor(() => {
      expect(mockedSendRuntimeMessage).toHaveBeenCalled()
    })

    vi.clearAllMocks()

    const inputs = screen.getAllByRole("spinbutton")
    const [
      intervalInput,
      concurrencyInput,
      retriesInput,
      rpmInput,
      burstInput,
    ] = inputs

    fireEvent.change(intervalInput, { target: { value: "0" } })
    fireEvent.change(concurrencyInput, { target: { value: "11" } })
    fireEvent.change(retriesInput, { target: { value: "6" } })
    fireEvent.change(rpmInput, { target: { value: "4" } })
    fireEvent.change(burstInput, { target: { value: "21" } })

    expect(mockUpdateNewApiModelSync).not.toHaveBeenCalled()
  })

  it("persists valid numeric updates for concurrency, retries, and rate limits", async () => {
    render(<ManagedSiteModelSyncSettings />)

    await waitFor(() => {
      expect(mockedSendRuntimeMessage).toHaveBeenCalled()
    })

    vi.clearAllMocks()

    const inputs = screen.getAllByRole("spinbutton")
    const [, concurrencyInput, retriesInput, rpmInput, burstInput] = inputs

    fireEvent.change(concurrencyInput, { target: { value: "4" } })
    fireEvent.change(retriesInput, { target: { value: "3" } })
    fireEvent.change(rpmInput, { target: { value: "30" } })
    fireEvent.change(burstInput, { target: { value: "8" } })

    await waitFor(() => {
      expect(mockUpdateNewApiModelSync).toHaveBeenCalledWith({
        concurrency: 4,
      })
      expect(mockUpdateNewApiModelSync).toHaveBeenCalledWith({
        maxRetries: 3,
      })
      expect(mockUpdateNewApiModelSync).toHaveBeenCalledWith({
        rateLimit: {
          requestsPerMinute: 30,
          burst: 5,
        },
      })
      expect(mockUpdateNewApiModelSync).toHaveBeenCalledWith({
        rateLimit: {
          requestsPerMinute: 20,
          burst: 8,
        },
      })
    })
  })

  it("shows a save error when preference updates return false", async () => {
    mockUpdateNewApiModelSync.mockResolvedValue(false)

    render(<ManagedSiteModelSyncSettings />)

    fireEvent.click(
      screen.getByRole("checkbox", { name: "managed-site-sync-enabled" }),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "settings:messages.saveSettingsFailed",
      )
    })

    expect(toast.success).not.toHaveBeenCalled()
  })

  it("shows a save error when preference updates throw", async () => {
    mockUpdateNewApiModelSync.mockRejectedValue(new Error("write failed"))

    render(<ManagedSiteModelSyncSettings />)

    fireEvent.click(
      screen.getByRole("checkbox", { name: "managed-site-sync-enabled" }),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "settings:messages.saveSettingsFailed",
      )
    })

    expect(toast.success).not.toHaveBeenCalled()
  })

  it("validates regex errors in the visual global filters editor before saving", async () => {
    render(<ManagedSiteModelSyncSettings />)

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteModelSync:settings.globalChannelModelFiltersButton",
      }),
    )

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

    expect(mockUpdateNewApiModelSync).not.toHaveBeenCalled()
  })

  it("validates missing visual filter fields before saving", async () => {
    render(<ManagedSiteModelSyncSettings />)

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteModelSync:settings.globalChannelModelFiltersButton",
      }),
    )

    fireEvent.click(screen.getByRole("button", { name: "add-filter" }))
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

    fireEvent.click(screen.getByRole("button", { name: "set-first-name" }))
    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:filters.actions.save",
      }),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "managedSiteChannels:filters.messages.validationPattern",
      )
    })

    expect(mockUpdateNewApiModelSync).not.toHaveBeenCalled()
  })

  it("validates and saves global channel filters from the JSON editor", async () => {
    render(<ManagedSiteModelSyncSettings />)

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteModelSync:settings.globalChannelModelFiltersButton",
      }),
    )

    expect(await screen.findByRole("dialog")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "view-json" }))
    fireEvent.change(screen.getByLabelText("json-text"), {
      target: {
        value: '[{"pattern":"^gpt","isRegex":true}]',
      },
    })

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:filters.actions.save",
      }),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "managedSiteChannels:filters.messages.jsonInvalid",
      )
    })

    fireEvent.change(screen.getByLabelText("json-text"), {
      target: {
        value: JSON.stringify([
          {
            name: "  GPT include  ",
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
      expect(mockUpdateNewApiModelSync).toHaveBeenCalledWith({
        globalChannelModelFilters: [
          expect.objectContaining({
            id: "generated-filter-id",
            name: "GPT include",
            description: "keep chat models",
            pattern: "^gpt",
            isRegex: true,
            action: "exclude",
            enabled: false,
          }),
        ],
      })
    })

    expect(toast.success).toHaveBeenCalledWith(
      "managedSiteChannels:filters.messages.saved",
    )
  })

  it("keeps the global filters dialog open when saving preferences fails", async () => {
    mockUpdateNewApiModelSync.mockResolvedValue(false)

    render(<ManagedSiteModelSyncSettings />)

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteModelSync:settings.globalChannelModelFiltersButton",
      }),
    )

    expect(await screen.findByRole("dialog")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "view-json" }))
    fireEvent.change(screen.getByLabelText("json-text"), {
      target: {
        value: JSON.stringify([
          {
            name: "Rule",
            pattern: "^gpt",
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
        "settings:messages.saveSettingsFailed",
      )
    })

    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(toast.success).not.toHaveBeenCalledWith(
      "managedSiteChannels:filters.messages.saved",
    )
  })

  it("keeps JSON mode active when switching back with invalid JSON", async () => {
    render(<ManagedSiteModelSyncSettings />)

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteModelSync:settings.globalChannelModelFiltersButton",
      }),
    )

    fireEvent.click(screen.getByRole("button", { name: "view-json" }))
    fireEvent.change(screen.getByLabelText("json-text"), {
      target: {
        value: "{invalid json",
      },
    })
    fireEvent.click(screen.getByRole("button", { name: "view-visual" }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "managedSiteChannels:filters.messages.jsonInvalid",
      )
    })

    expect(screen.getByTestId("filter-view-mode")).toHaveTextContent("json")
  })

  it("closes the global filters dialog when cancel is clicked outside a save", async () => {
    render(<ManagedSiteModelSyncSettings />)

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteModelSync:settings.globalChannelModelFiltersButton",
      }),
    )

    expect(await screen.findByRole("dialog")).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:filters.actions.cancel",
      }),
    )

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })
  })

  it("falls back to empty JSON text when existing filters cannot be stringified", async () => {
    const circularFilter: any = {
      id: "circular-filter",
      name: "Rule",
      pattern: "^gpt",
      isRegex: true,
      action: "include",
      enabled: true,
      createdAt: 1,
      updatedAt: 1,
      description: "keep",
    }
    circularFilter.self = circularFilter

    mockedUseUserPreferencesContext.mockReturnValue(
      createContextValue({
        preferences: {
          managedSiteModelSync: {
            enabled: true,
            interval: 24 * 60 * 60 * 1000,
            concurrency: 2,
            maxRetries: 2,
            rateLimit: { requestsPerMinute: 20, burst: 5 },
            allowedModels: ["existing-model"],
            globalChannelModelFilters: [circularFilter],
          },
        },
      }),
    )

    render(<ManagedSiteModelSyncSettings />)

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteModelSync:settings.globalChannelModelFiltersButton",
      }),
    )

    expect(await screen.findByRole("dialog")).toBeInTheDocument()
    expect(screen.getByLabelText("json-text")).toHaveValue("")
    expect(screen.getByTestId("filter-count")).toHaveTextContent("1")
  })

  it("falls back to empty JSON text when switching the dialog draft to JSON fails to stringify", async () => {
    const circularFilter: any = {
      id: "circular-filter",
      name: "Rule",
      pattern: "^gpt",
      isRegex: true,
      action: "include",
      enabled: true,
      createdAt: 1,
      updatedAt: 1,
      description: "keep",
    }
    circularFilter.self = circularFilter

    mockedUseUserPreferencesContext.mockReturnValue(
      createContextValue({
        preferences: {
          managedSiteModelSync: {
            enabled: true,
            interval: 24 * 60 * 60 * 1000,
            concurrency: 2,
            maxRetries: 2,
            rateLimit: { requestsPerMinute: 20, burst: 5 },
            allowedModels: ["existing-model"],
            globalChannelModelFilters: [circularFilter],
          },
        },
      }),
    )

    render(<ManagedSiteModelSyncSettings />)

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteModelSync:settings.globalChannelModelFiltersButton",
      }),
    )

    expect(await screen.findByRole("dialog")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "view-json" }))

    expect(screen.getByTestId("filter-view-mode")).toHaveTextContent("json")
    expect(screen.getByLabelText("json-text")).toHaveValue("")
  })

  it("removes an existing visual filter and persists an empty filter set", async () => {
    mockedUseUserPreferencesContext.mockReturnValue(
      createContextValue({
        preferences: {
          managedSiteModelSync: {
            enabled: true,
            interval: 24 * 60 * 60 * 1000,
            concurrency: 2,
            maxRetries: 2,
            rateLimit: { requestsPerMinute: 20, burst: 5 },
            allowedModels: ["existing-model"],
            globalChannelModelFilters: [
              {
                id: "existing-filter",
                name: "Rule",
                pattern: "^gpt",
                isRegex: true,
                action: "include",
                enabled: true,
                createdAt: 1,
                updatedAt: 1,
                description: "keep",
              },
            ],
          },
        },
      }),
    )

    render(<ManagedSiteModelSyncSettings />)

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteModelSync:settings.globalChannelModelFiltersButton",
      }),
    )

    expect(await screen.findByRole("dialog")).toBeInTheDocument()
    expect(screen.getByTestId("filter-count")).toHaveTextContent("1")

    fireEvent.click(screen.getByRole("button", { name: "remove-filter" }))

    expect(screen.getByTestId("filter-count")).toHaveTextContent("0")

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:filters.actions.save",
      }),
    )

    await waitFor(() => {
      expect(mockUpdateNewApiModelSync).toHaveBeenCalledWith({
        globalChannelModelFilters: [],
      })
    })

    expect(toast.success).toHaveBeenCalledWith(
      "managedSiteChannels:filters.messages.saved",
    )
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })
  })

  it("keeps the dialog open when close is requested during an in-flight save", async () => {
    const deferredSave = createDeferred<boolean>()
    mockUpdateNewApiModelSync.mockReturnValue(deferredSave.promise)

    render(<ManagedSiteModelSyncSettings />)

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteModelSync:settings.globalChannelModelFiltersButton",
      }),
    )

    expect(await screen.findByRole("dialog")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "add-filter" }))
    fireEvent.click(screen.getByRole("button", { name: "set-first-name" }))
    fireEvent.click(screen.getByRole("button", { name: "set-valid-pattern" }))
    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:filters.actions.save",
      }),
    )

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "managedSiteChannels:filters.actions.cancel",
        }),
      ).toBeDisabled()
    })

    fireEvent.click(screen.getByRole("button", { name: "modal-close" }))

    expect(screen.getByRole("dialog")).toBeInTheDocument()

    deferredSave.resolve(true)

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })
  })

  it("switches blank JSON back to visual mode as an empty filter set", async () => {
    mockedUseUserPreferencesContext.mockReturnValue(
      createContextValue({
        preferences: {
          managedSiteModelSync: {
            enabled: true,
            interval: 24 * 60 * 60 * 1000,
            concurrency: 2,
            maxRetries: 2,
            rateLimit: { requestsPerMinute: 20, burst: 5 },
            allowedModels: ["existing-model"],
            globalChannelModelFilters: [
              {
                id: "existing-filter",
                name: "Rule",
                pattern: "^gpt",
                isRegex: true,
                action: "include",
                enabled: true,
                createdAt: 1,
                updatedAt: 1,
                description: "keep",
              },
            ],
          },
        },
      }),
    )

    render(<ManagedSiteModelSyncSettings />)

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteModelSync:settings.globalChannelModelFiltersButton",
      }),
    )

    expect(await screen.findByRole("dialog")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "view-json" }))
    fireEvent.change(screen.getByLabelText("json-text"), {
      target: {
        value: "   ",
      },
    })
    fireEvent.click(screen.getByRole("button", { name: "view-visual" }))

    expect(screen.getByTestId("filter-view-mode")).toHaveTextContent("visual")
    expect(screen.getByTestId("filter-count")).toHaveTextContent("0")

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:filters.actions.save",
      }),
    )

    await waitFor(() => {
      expect(mockUpdateNewApiModelSync).toHaveBeenCalledWith({
        globalChannelModelFilters: [],
      })
    })
  })

  it("saves an empty filter set when the JSON editor contains only whitespace", async () => {
    render(<ManagedSiteModelSyncSettings />)

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteModelSync:settings.globalChannelModelFiltersButton",
      }),
    )

    expect(await screen.findByRole("dialog")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "view-json" }))
    fireEvent.change(screen.getByLabelText("json-text"), {
      target: {
        value: "   ",
      },
    })

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:filters.actions.save",
      }),
    )

    await waitFor(() => {
      expect(mockUpdateNewApiModelSync).toHaveBeenCalledWith({
        globalChannelModelFilters: [],
      })
    })
  })

  it("shows a save-failed toast when malformed persisted filter data breaks payload serialization", async () => {
    mockedUseUserPreferencesContext.mockReturnValue(
      createContextValue({
        preferences: {
          managedSiteModelSync: {
            enabled: true,
            interval: 24 * 60 * 60 * 1000,
            concurrency: 2,
            maxRetries: 2,
            rateLimit: { requestsPerMinute: 20, burst: 5 },
            allowedModels: ["existing-model"],
            globalChannelModelFilters: [
              {
                id: "broken-filter",
                name: "Rule",
                pattern: "^gpt",
                isRegex: true,
                action: "include",
                enabled: true,
                createdAt: 1,
                updatedAt: 1,
                description: {
                  trim: () => {
                    throw new Error("description exploded")
                  },
                },
              },
            ],
          },
        },
      }),
    )

    render(<ManagedSiteModelSyncSettings />)

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteModelSync:settings.globalChannelModelFiltersButton",
      }),
    )

    expect(await screen.findByRole("dialog")).toBeInTheDocument()

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

    expect(mockUpdateNewApiModelSync).not.toHaveBeenCalled()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("rejects JSON arrays that contain non-object items", async () => {
    render(<ManagedSiteModelSyncSettings />)

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteModelSync:settings.globalChannelModelFiltersButton",
      }),
    )

    expect(await screen.findByRole("dialog")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "view-json" }))
    fireEvent.change(screen.getByLabelText("json-text"), {
      target: {
        value: "[null]",
      },
    })

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:filters.actions.save",
      }),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "managedSiteChannels:filters.messages.jsonInvalid",
      )
    })

    expect(mockUpdateNewApiModelSync).not.toHaveBeenCalled()
  })

  it("rejects JSON items that omit the pattern field", async () => {
    render(<ManagedSiteModelSyncSettings />)

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteModelSync:settings.globalChannelModelFiltersButton",
      }),
    )

    expect(await screen.findByRole("dialog")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "view-json" }))
    fireEvent.change(screen.getByLabelText("json-text"), {
      target: {
        value: '[{"name":"Rule"}]',
      },
    })

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:filters.actions.save",
      }),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "managedSiteChannels:filters.messages.jsonInvalid",
      )
    })

    expect(mockUpdateNewApiModelSync).not.toHaveBeenCalled()
  })

  it("rejects non-array JSON filter payloads before saving", async () => {
    render(<ManagedSiteModelSyncSettings />)

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteModelSync:settings.globalChannelModelFiltersButton",
      }),
    )

    fireEvent.click(screen.getByRole("button", { name: "view-json" }))
    fireEvent.change(screen.getByLabelText("json-text"), {
      target: {
        value: '{"name":"Rule","pattern":"^gpt"}',
      },
    })
    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:filters.actions.save",
      }),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "managedSiteChannels:filters.messages.jsonInvalid",
      )
    })

    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(mockUpdateNewApiModelSync).not.toHaveBeenCalled()
  })

  it("navigates to the execution page and resets the section through SettingSection", async () => {
    render(<ManagedSiteModelSyncSettings />)

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteModelSync:settings.viewExecutionButton",
      }),
    )
    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.reset" }),
    )

    await waitFor(() => {
      expect(mockResetNewApiModelSyncConfig).toHaveBeenCalledTimes(1)
    })

    expect(mockedPushWithinOptionsPage).toHaveBeenCalledWith(
      `#${MENU_ITEM_IDS.MANAGED_SITE_MODEL_SYNC}`,
    )
  })
})
