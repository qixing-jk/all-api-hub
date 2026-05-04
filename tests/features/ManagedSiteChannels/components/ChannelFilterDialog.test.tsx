import type { ReactNode } from "react"
import toast from "react-hot-toast"
import { beforeEach, describe, expect, it, vi } from "vitest"

import ChannelFilterDialog from "~/features/ManagedSiteChannels/components/ChannelFilterDialog"
import {
  fetchChannelFilters,
  saveChannelFilters,
} from "~/features/ManagedSiteChannels/utils/channelFilters"
import { fireEvent, render, screen, waitFor } from "~~/tests/test-utils/render"

const { mockFetchChannelFilters, mockSaveChannelFilters } = vi.hoisted(() => ({
  mockFetchChannelFilters: vi.fn(),
  mockSaveChannelFilters: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock("~/features/ManagedSiteChannels/utils/channelFilters", () => ({
  fetchChannelFilters: mockFetchChannelFilters,
  saveChannelFilters: mockSaveChannelFilters,
}))

vi.mock("~/utils/core/identifier", () => ({
  safeRandomUUID: vi.fn(() => "generated-filter-id"),
}))

vi.mock("~/components/ui", () => ({
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
}))

vi.mock("~/components/ChannelFiltersEditor", () => ({
  default: ({
    filters,
    viewMode,
    jsonText,
    isLoading,
    onAddFilter,
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
      <button onClick={onAddFilter}>add-filter</button>
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

const mockedFetchChannelFilters = fetchChannelFilters as unknown as ReturnType<
  typeof vi.fn
>
const mockedSaveChannelFilters = saveChannelFilters as unknown as ReturnType<
  typeof vi.fn
>

const sampleChannel = {
  id: 42,
  name: "Alpha",
} as any

describe("ChannelFilterDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000)
    mockedFetchChannelFilters.mockResolvedValue([])
    mockedSaveChannelFilters.mockResolvedValue(undefined)
  })

  it("loads existing filters when opened", async () => {
    mockedFetchChannelFilters.mockResolvedValue([
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
    ])

    render(
      <ChannelFilterDialog
        channel={sampleChannel}
        open={true}
        onClose={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(mockedFetchChannelFilters).toHaveBeenCalledWith(42)
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
  })

  it("shows an error toast and closes when filters fail to load", async () => {
    const onClose = vi.fn()
    mockedFetchChannelFilters.mockRejectedValue(new Error("load failed"))

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
      expect(mockedSaveChannelFilters).toHaveBeenCalledWith(42, [
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
      ])
    })

    expect(toast.success).toHaveBeenCalledWith(
      "managedSiteChannels:filters.messages.saved",
    )
    expect(onClose).toHaveBeenCalledTimes(1)
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
