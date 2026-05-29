import type { ReactNode } from "react"
import toast from "react-hot-toast"
import { beforeEach, describe, expect, it, vi } from "vitest"

import WebAiApiCheckSettings from "~/features/BasicSettings/components/tabs/WebAiApiCheck/WebAiApiCheckSettings"
import { fireEvent, render, screen, waitFor } from "~~/tests/test-utils/render"

const {
  mockedUseUserPreferencesContext,
  mockUpdateWebAiApiCheck,
  mockResetWebAiApiCheckConfig,
  mockLoggerError,
} = vi.hoisted(() => ({
  mockedUseUserPreferencesContext: vi.fn(),
  mockUpdateWebAiApiCheck: vi.fn(),
  mockResetWebAiApiCheckConfig: vi.fn(),
  mockLoggerError: vi.fn(),
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

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({
    error: mockLoggerError,
  }),
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
    <section data-testid="web-ai-api-check-settings">
      <h2>{title}</h2>
      <p>{description}</p>
      <button type="button" onClick={() => void onReset?.()}>
        common:actions.reset
      </button>
      {children}
    </section>
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
    <button type="button" disabled={disabled} onClick={() => onClick?.()}>
      {children}
    </button>
  ),
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardItem: ({
    title,
    description,
    rightContent,
  }: {
    title?: ReactNode
    description?: ReactNode
    rightContent?: ReactNode
  }) => (
    <div>
      {title ? <div>{title}</div> : null}
      {description ? <div>{description}</div> : null}
      {rightContent}
    </div>
  ),
  CardList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Switch: ({
    checked,
    onChange,
    disabled,
  }: {
    checked?: boolean
    onChange?: (checked: boolean) => void
    disabled?: boolean
  }) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
    >
      {String(checked)}
    </button>
  ),
  Textarea: ({
    value,
    onChange,
    placeholder,
    disabled,
  }: {
    value?: string
    onChange?: (event: { target: { value: string } }) => void
    placeholder?: string
    disabled?: boolean
  }) => (
    <textarea
      aria-label={placeholder ?? "textarea"}
      value={value}
      disabled={disabled}
      onChange={(event) =>
        onChange?.({ target: { value: event.currentTarget.value } })
      }
    />
  ),
}))

const createContextValue = (overrides: Record<string, unknown> = {}) => ({
  preferences: {
    webAiApiCheck: {
      enabled: true,
      contextMenu: {
        enabled: true,
      },
      autoDetect: {
        enabled: true,
        enhanced: { enabled: true },
        urlWhitelist: {
          patterns: ["^https://stored\\.example\\.com"],
        },
      },
    },
  },
  updateWebAiApiCheck: mockUpdateWebAiApiCheck,
  resetWebAiApiCheckConfig: mockResetWebAiApiCheckConfig,
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

describe("WebAiApiCheckSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateWebAiApiCheck.mockResolvedValue(true)
    mockResetWebAiApiCheckConfig.mockResolvedValue(true)
    mockedUseUserPreferencesContext.mockReturnValue(createContextValue())
  })

  it("falls back to default nested settings, trims saved patterns, and resets through SettingSection", async () => {
    mockedUseUserPreferencesContext.mockReturnValue(
      createContextValue({
        preferences: {
          webAiApiCheck: undefined,
        },
      }),
    )

    render(<WebAiApiCheckSettings />)

    const switches = screen.getAllByRole("switch")
    expect(switches[0]).toHaveAttribute("aria-checked", "true")
    expect(switches[1]).toHaveAttribute("aria-checked", "true")
    expect(switches[2]).toHaveAttribute("aria-checked", "true")

    const textarea = screen.getByLabelText(
      "webAiApiCheck:settings.autoDetect.whitelist.patternsPlaceholder",
    )
    expect(textarea).toHaveValue("")

    fireEvent.change(textarea, {
      target: {
        value:
          " \n  ^https://one\\.example\\.com  \n\n^https://two\\.example\\.com/path$  ",
      },
    })

    fireEvent.click(screen.getByRole("button", { name: "common:actions.save" }))

    await waitFor(() => {
      expect(mockUpdateWebAiApiCheck).toHaveBeenCalledWith({
        autoDetect: {
          enabled: true,
          enhanced: { enabled: true },
          urlWhitelist: {
            patterns: [
              "^https://one\\.example\\.com",
              "^https://two\\.example\\.com/path$",
            ],
          },
        },
      })
    })

    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.reset" }),
    )

    await waitFor(() => {
      expect(mockResetWebAiApiCheckConfig).toHaveBeenCalledTimes(1)
    })
  })

  it("shows invalid regex warnings, caps the list at ten items, and reports overflow", () => {
    render(<WebAiApiCheckSettings />)

    const invalidPatterns = Array.from(
      { length: 11 },
      (_, index) => `invalid-${index}[`,
    )
    fireEvent.change(
      screen.getByLabelText(
        "webAiApiCheck:settings.autoDetect.whitelist.patternsPlaceholder",
      ),
      {
        target: {
          value: invalidPatterns.join("\n"),
        },
      },
    )

    expect(
      screen.getByText(
        "webAiApiCheck:settings.autoDetect.whitelist.invalidTitle",
      ),
    ).toBeInTheDocument()

    for (const pattern of invalidPatterns.slice(0, 10)) {
      expect(screen.getByText(pattern)).toBeInTheDocument()
    }

    expect(screen.queryByText(invalidPatterns[10])).toBeNull()
    expect(
      screen.getByText(
        "webAiApiCheck:settings.autoDetect.whitelist.invalidMore",
      ),
    ).toBeInTheDocument()
  })

  it("toggles enhanced auto-detect without changing whitelist patterns", async () => {
    render(<WebAiApiCheckSettings />)

    const switches = screen.getAllByRole("switch")
    expect(switches[2]).toHaveAttribute("aria-checked", "true")

    fireEvent.click(switches[2])

    await waitFor(() => {
      expect(mockUpdateWebAiApiCheck).toHaveBeenCalledWith({
        autoDetect: {
          enabled: true,
          enhanced: { enabled: false },
          urlWhitelist: {
            patterns: ["^https://stored\\.example\\.com"],
          },
        },
      })
    })
  })

  it("disables enhanced auto-detect control when auto-detect is disabled", () => {
    mockedUseUserPreferencesContext.mockReturnValue(
      createContextValue({
        preferences: {
          webAiApiCheck: {
            enabled: true,
            contextMenu: { enabled: true },
            autoDetect: {
              enabled: false,
              enhanced: { enabled: true },
              urlWhitelist: { patterns: [] },
            },
          },
        },
      }),
    )

    render(<WebAiApiCheckSettings />)

    const switches = screen.getAllByRole("switch")
    expect(switches[2]).toBeDisabled()
  })

  it("disables controls while a switch save is in flight and shows an error toast when persistence fails", async () => {
    const deferredSave = createDeferred<boolean>()
    mockUpdateWebAiApiCheck.mockReturnValue(deferredSave.promise)

    render(<WebAiApiCheckSettings />)

    const switches = screen.getAllByRole("switch")
    const textarea = screen.getByLabelText(
      "webAiApiCheck:settings.autoDetect.whitelist.patternsPlaceholder",
    )
    const saveButton = screen.getByRole("button", {
      name: "common:actions.save",
    })

    fireEvent.click(switches[0])

    await waitFor(() => {
      expect(switches[0]).toBeDisabled()
      expect(switches[1]).toBeDisabled()
      expect(switches[2]).toBeDisabled()
      expect(textarea).toBeDisabled()
      expect(saveButton).toBeDisabled()
    })

    deferredSave.resolve(false)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "settings:messages.saveSettingsFailed",
      )
    })

    await waitFor(() => {
      expect(switches[0]).not.toBeDisabled()
      expect(textarea).not.toBeDisabled()
      expect(saveButton).not.toBeDisabled()
    })
    expect(mockUpdateWebAiApiCheck).toHaveBeenCalledWith({
      contextMenu: {
        enabled: false,
      },
    })
    expect(toast.success).not.toHaveBeenCalled()
  })

  it("logs and reports a translated error when whitelist saving throws", async () => {
    mockUpdateWebAiApiCheck.mockRejectedValueOnce(new Error("network down"))

    render(<WebAiApiCheckSettings />)

    fireEvent.change(
      screen.getByLabelText(
        "webAiApiCheck:settings.autoDetect.whitelist.patternsPlaceholder",
      ),
      {
        target: {
          value: "^https://throw\\.example\\.com",
        },
      },
    )

    fireEvent.click(screen.getByRole("button", { name: "common:actions.save" }))

    await waitFor(() => {
      expect(mockLoggerError).toHaveBeenCalledWith(
        "Failed to save Web AI API Check settings",
        expect.any(Error),
      )
      expect(toast.error).toHaveBeenCalledWith(
        "settings:messages.saveSettingsFailed",
      )
    })
  })

  it("resyncs the whitelist draft when stored preferences change", async () => {
    let contextValue = createContextValue()
    mockedUseUserPreferencesContext.mockImplementation(() => contextValue)

    const { rerender } = render(<WebAiApiCheckSettings />)

    const textarea = screen.getByLabelText(
      "webAiApiCheck:settings.autoDetect.whitelist.patternsPlaceholder",
    )
    fireEvent.change(textarea, {
      target: { value: "^https://draft-only\\.example\\.com" },
    })

    contextValue = createContextValue({
      preferences: {
        webAiApiCheck: {
          enabled: true,
          contextMenu: {
            enabled: false,
          },
          autoDetect: {
            enabled: true,
            urlWhitelist: {
              patterns: [
                "^https://server\\.example\\.com",
                "^https://next\\.example\\.com",
              ],
            },
          },
        },
      },
    })

    rerender(<WebAiApiCheckSettings />)

    await waitFor(() => {
      expect(textarea).toHaveValue(
        "^https://server\\.example\\.com\n^https://next\\.example\\.com",
      )
    })
  })
})
