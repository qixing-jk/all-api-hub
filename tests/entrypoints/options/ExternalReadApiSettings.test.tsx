import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import toast from "react-hot-toast"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import ExternalReadApiSettings from "~/features/BasicSettings/components/tabs/General/ExternalReadApiSettings"
import { testI18n } from "~~/tests/test-utils/i18n"

const {
  mockedUseUserPreferencesContext,
  mockUpdateExternalReadApi,
  mockResetExternalReadApiConfig,
  mockLoggerError,
} = vi.hoisted(() => ({
  mockedUseUserPreferencesContext: vi.fn(),
  mockUpdateExternalReadApi: vi.fn(),
  mockResetExternalReadApiConfig: vi.fn(),
  mockLoggerError: vi.fn(),
}))

vi.mock("~/contexts/UserPreferencesContext", () => {
  return {
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
    <section data-testid="external-read-api-settings">
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
  Input: ({
    value,
    onChange,
    placeholder,
    disabled,
    readOnly,
  }: {
    value?: string
    onChange?: (event: { target: { value: string } }) => void
    placeholder?: string
    disabled?: boolean
    readOnly?: boolean
  }) => (
    <input
      aria-label={placeholder ?? "input"}
      value={value}
      disabled={disabled}
      readOnly={readOnly}
      onChange={(event) =>
        onChange?.({ target: { value: event.currentTarget.value } })
      }
    />
  ),
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
}))

const createContextValue = (overrides: Record<string, unknown> = {}) => ({
  preferences: {
    externalReadApi: {
      enabled: false,
      notificationsEnabled: true,
      tokens: [
        {
          id: "token-1",
          name: "existing-client",
          token: "aah_existing",
          createdAt: 1,
          enabled: true,
        },
      ],
    },
  },
  updateExternalReadApi: mockUpdateExternalReadApi,
  resetExternalReadApiConfig: mockResetExternalReadApiConfig,
  ...overrides,
})

function renderSettings() {
  return render(
    <I18nextProvider i18n={testI18n}>
      <ExternalReadApiSettings />
    </I18nextProvider>,
  )
}

describe("ExternalReadApiSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateExternalReadApi.mockResolvedValue(true)
    mockResetExternalReadApiConfig.mockResolvedValue(true)
    mockedUseUserPreferencesContext.mockReturnValue(createContextValue())
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => "uuid-2"),
      getRandomValues: vi.fn((values: Uint8Array) => {
        values.fill(1)
        return values
      }),
    })
    Object.defineProperty(globalThis.navigator, "clipboard", {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      configurable: true,
    })
  })

  it("creates a named token and resets through SettingSection", async () => {
    renderSettings()

    const input = screen.getByLabelText(
      "settings:externalReadApi.tokenNamePlaceholder",
    )
    fireEvent.change(input, { target: { value: "metapi-sync" } })

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:externalReadApi.generateToken",
      }),
    )

    await waitFor(() => {
      expect(mockUpdateExternalReadApi).toHaveBeenCalledWith({
        tokens: [
          {
            id: "token-1",
            name: "existing-client",
            token: "aah_existing",
            createdAt: 1,
            enabled: true,
          },
          {
            id: "uuid-2",
            name: "metapi-sync",
            token: `aah_${"01".repeat(24)}`,
            createdAt: expect.any(Number),
            enabled: true,
          },
        ],
      })
    })

    expect(toast.success).toHaveBeenCalledWith(
      "settings:messages.updateSuccess",
    )

    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.reset" }),
    )

    await waitFor(() => {
      expect(mockResetExternalReadApiConfig).toHaveBeenCalledTimes(1)
    })
  })

  it("copies and regenerates an existing token", async () => {
    renderSettings()

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:externalReadApi.copyToken",
      }),
    )

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("aah_existing")
    })

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:externalReadApi.regenerateToken",
      }),
    )

    await waitFor(() => {
      expect(mockUpdateExternalReadApi).toHaveBeenCalledWith({
        tokens: [
          {
            id: "token-1",
            name: "existing-client",
            token: `aah_${"01".repeat(24)}`,
            createdAt: 1,
            enabled: true,
          },
        ],
      })
    })
  })
})
