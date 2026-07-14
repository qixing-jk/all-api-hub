import type { ReactNode } from "react"
import toast from "react-hot-toast"
import { beforeEach, describe, expect, it, vi } from "vitest"

import WebAiApiCheckSettings from "~/features/BasicSettings/components/tabs/WebAiApiCheck/WebAiApiCheckSettings"
import {
  PREFERENCE_WRITE_FAILURE_TYPES,
  type PreferenceWriteResult,
} from "~/services/preferences/userPreferences"
import { buildUserPreferences } from "~~/tests/test-utils/factories"
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
    loading,
    id,
  }: {
    children: ReactNode
    onClick?: () => void
    disabled?: boolean
    loading?: boolean
    id?: string
  }) => (
    <button
      id={id}
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onClick={() => onClick?.()}
    >
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
      keyCleanup: {
        removalPatterns: ["\\[\\[remove-me\\]\\]"],
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

const createSuccessfulPreferenceWriteResult = (): PreferenceWriteResult => ({
  ok: true,
  preferences: buildUserPreferences(),
})

describe("WebAiApiCheckSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateWebAiApiCheck.mockResolvedValue(
      createSuccessfulPreferenceWriteResult(),
    )
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
    expect(
      screen.getByLabelText(
        "webAiApiCheck:settings.keyCleanup.patternsPlaceholder",
      ),
    ).toHaveValue("")

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

  it("trims and saves custom API key cleanup removal regex patterns", async () => {
    render(<WebAiApiCheckSettings />)

    const textarea = screen.getByLabelText(
      "webAiApiCheck:settings.keyCleanup.patternsPlaceholder",
    )
    expect(textarea).toHaveValue("\\[\\[remove-me\\]\\]")

    fireEvent.change(textarea, {
      target: {
        value: " \\[\\[ad\\]\\] \n\n<remove-this>",
      },
    })

    fireEvent.click(
      screen.getByRole("button", {
        name: "webAiApiCheck:settings.keyCleanup.save",
      }),
    )

    await waitFor(() => {
      expect(mockUpdateWebAiApiCheck).toHaveBeenCalledWith({
        keyCleanup: {
          removalPatterns: ["\\[\\[ad\\]\\]", "<remove-this>"],
        },
      })
    })
  })

  it("shows invalid custom API key cleanup regex warnings", () => {
    render(<WebAiApiCheckSettings />)

    fireEvent.change(
      screen.getByLabelText(
        "webAiApiCheck:settings.keyCleanup.patternsPlaceholder",
      ),
      {
        target: {
          value: "broken-[",
        },
      },
    )

    expect(
      screen.getByText("webAiApiCheck:settings.keyCleanup.invalidTitle"),
    ).toBeInTheDocument()
    expect(screen.getAllByText("broken-[")).toHaveLength(2)
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
    const deferredSave = createDeferred<PreferenceWriteResult>()
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
      expect(
        screen.getByLabelText(
          "webAiApiCheck:settings.keyCleanup.patternsPlaceholder",
        ),
      ).toBeDisabled()
      expect(saveButton).toBeDisabled()
    })

    deferredSave.resolve({
      ok: false,
      reason: {
        type: PREFERENCE_WRITE_FAILURE_TYPES.StorageError,
        error: new Error("write failed"),
      },
    })

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

  it.each([
    {
      action: "URL patterns",
      buttonName: "common:actions.save",
      siblingName: "webAiApiCheck:settings.keyCleanup.save",
    },
    {
      action: "key cleanup patterns",
      buttonName: "webAiApiCheck:settings.keyCleanup.save",
      siblingName: "common:actions.save",
    },
  ])(
    "marks only the initiating $action save busy and restores it after rejection",
    async ({ buttonName, siblingName }) => {
      const deferredSave = createDeferred<PreferenceWriteResult>()
      mockUpdateWebAiApiCheck.mockReturnValueOnce(deferredSave.promise)

      render(<WebAiApiCheckSettings />)

      const initiatingButton = screen.getByRole("button", {
        name: buttonName,
      })
      const siblingButton = screen.getByRole("button", {
        name: siblingName,
      })

      fireEvent.click(initiatingButton)

      await waitFor(() => {
        expect(initiatingButton).toHaveAccessibleName("common:status.saving")
      })
      expect(initiatingButton).toBeDisabled()
      expect(initiatingButton).toHaveAttribute("aria-busy", "true")
      expect(siblingButton).toBeDisabled()
      expect(siblingButton).toHaveAccessibleName(siblingName)
      expect(siblingButton).not.toHaveAttribute("aria-busy")
      for (const control of screen.getAllByRole("switch")) {
        expect(control).toBeDisabled()
        expect(control).not.toHaveAttribute("aria-busy")
      }

      fireEvent.click(initiatingButton)
      expect(mockUpdateWebAiApiCheck).toHaveBeenCalledTimes(1)

      deferredSave.reject(new Error("write failed"))

      await waitFor(() => {
        expect(initiatingButton).toHaveAccessibleName(buttonName)
        expect(initiatingButton).toBeEnabled()
        expect(initiatingButton).not.toHaveAttribute("aria-busy")
      })

      mockUpdateWebAiApiCheck.mockResolvedValueOnce(
        createSuccessfulPreferenceWriteResult(),
      )
      fireEvent.click(initiatingButton)
      await waitFor(() => {
        expect(mockUpdateWebAiApiCheck).toHaveBeenCalledTimes(2)
        expect(initiatingButton).toHaveAccessibleName(buttonName)
        expect(initiatingButton).toBeEnabled()
        expect(initiatingButton).not.toHaveAttribute("aria-busy")
        expect(toast.success).toHaveBeenCalledWith(
          "webAiApiCheck:messages.success.settingsSaved",
        )
      })
    },
  )

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
          keyCleanup: {
            removalPatterns: ["server-cleanup"],
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
    expect(
      screen.getByLabelText(
        "webAiApiCheck:settings.keyCleanup.patternsPlaceholder",
      ),
    ).toHaveValue("server-cleanup")
  })
})
