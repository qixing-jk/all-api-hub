import type { ReactNode } from "react"
import toast from "react-hot-toast"
import { beforeEach, describe, expect, it, vi } from "vitest"

import AxonHubSettings from "~/features/BasicSettings/components/tabs/ManagedSite/AxonHubSettings"
import { signIn } from "~/services/apiService/axonHub"
import { showUpdateToast } from "~/utils/core/toastHelpers"
import { fireEvent, render, screen, waitFor } from "~~/tests/test-utils/render"

const {
  mockResetAxonHubConfig,
  mockUpdateAxonHubBaseUrl,
  mockUpdateAxonHubConfig,
  mockUpdateAxonHubEmail,
  mockUpdateAxonHubPassword,
  mockedUseUserPreferencesContext,
} = vi.hoisted(() => ({
  mockResetAxonHubConfig: vi.fn(),
  mockUpdateAxonHubBaseUrl: vi.fn(),
  mockUpdateAxonHubConfig: vi.fn(),
  mockUpdateAxonHubEmail: vi.fn(),
  mockUpdateAxonHubPassword: vi.fn(),
  mockedUseUserPreferencesContext: vi.fn(),
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

vi.mock("~/services/apiService/axonHub", () => ({
  signIn: vi.fn(),
}))

vi.mock("~/utils/core/toastHelpers", () => ({
  showUpdateToast: vi.fn(),
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
    description,
    onReset,
    title,
  }: {
    children: ReactNode
    description: string
    onReset?: () => Promise<boolean>
    title: string
  }) => (
    <section>
      <h2>{title}</h2>
      <p>{description}</p>
      <button onClick={() => void onReset?.()}>common:actions.reset</button>
      {children}
    </section>
  ),
}))

vi.mock("~/components/ui", () => ({
  Button: ({
    children,
    disabled,
    onClick,
  }: {
    children: ReactNode
    disabled?: boolean
    onClick?: () => void
  }) => (
    <button disabled={disabled} onClick={() => onClick?.()}>
      {children}
    </button>
  ),
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardItem: ({
    description,
    rightContent,
    title,
  }: {
    description?: ReactNode
    rightContent?: ReactNode
    title?: ReactNode
  }) => (
    <div>
      {title ? <div>{title}</div> : null}
      {description ? <div>{description}</div> : null}
      {rightContent}
    </div>
  ),
  CardList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  IconButton: ({
    children,
    onClick,
    "aria-label": ariaLabel,
  }: {
    children: ReactNode
    onClick?: () => void
    "aria-label"?: string
  }) => (
    <button aria-label={ariaLabel} onClick={() => onClick?.()}>
      {children}
    </button>
  ),
  Input: ({
    onBlur,
    onChange,
    placeholder,
    rightIcon,
    type,
    value,
  }: {
    onBlur?: (event: { target: { value: string } }) => void
    onChange?: (event: { target: { value: string } }) => void
    placeholder?: string
    rightIcon?: ReactNode
    type?: string
    value?: string
  }) => (
    <div>
      <input
        aria-label={placeholder ?? type ?? "input"}
        type={type}
        value={value}
        onBlur={(event) =>
          onBlur?.({ target: { value: event.currentTarget.value } })
        }
        onChange={(event) =>
          onChange?.({ target: { value: event.currentTarget.value } })
        }
      />
      {rightIcon}
    </div>
  ),
}))

const mockedSignIn = signIn as ReturnType<typeof vi.fn>
const mockedShowUpdateToast = showUpdateToast as ReturnType<typeof vi.fn>

const createContextValue = (overrides: Record<string, unknown> = {}) => ({
  preferences: { lastUpdated: 1 },
  axonHubBaseUrl: "https://axonhub.example",
  axonHubEmail: "admin@example.com",
  axonHubPassword: "password",
  updateAxonHubBaseUrl: mockUpdateAxonHubBaseUrl,
  updateAxonHubConfig: mockUpdateAxonHubConfig,
  updateAxonHubEmail: mockUpdateAxonHubEmail,
  updateAxonHubPassword: mockUpdateAxonHubPassword,
  resetAxonHubConfig: mockResetAxonHubConfig,
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

describe("AxonHubSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockResetAxonHubConfig.mockResolvedValue(true)
    mockUpdateAxonHubBaseUrl.mockResolvedValue(true)
    mockUpdateAxonHubConfig.mockResolvedValue(true)
    mockUpdateAxonHubEmail.mockResolvedValue(true)
    mockUpdateAxonHubPassword.mockResolvedValue(true)
    mockedSignIn.mockResolvedValue({ accessToken: "token" })
    mockedUseUserPreferencesContext.mockReturnValue(createContextValue())
  })

  it("trims persisted field updates, skips unchanged values, and resets", async () => {
    render(<AxonHubSettings />)

    expect(screen.getByText("settings:axonHub.cors.title")).toBeInTheDocument()
    expect(
      screen.getByText("settings:axonHub.cors.description"),
    ).toBeInTheDocument()

    const baseUrlInput = screen.getByLabelText(
      "settings:axonHub.fields.baseUrlPlaceholder",
    )
    fireEvent.change(baseUrlInput, {
      target: { value: "  https://new-axonhub.example  " },
    })
    fireEvent.blur(baseUrlInput)

    await waitFor(() => {
      expect(mockUpdateAxonHubBaseUrl).toHaveBeenCalledWith(
        "https://new-axonhub.example",
        {
          expectedLastUpdated: 1,
        },
      )
    })
    expect(mockedShowUpdateToast).toHaveBeenCalledWith(
      true,
      "settings:axonHub.fields.baseUrlLabel",
    )

    const emailInput = screen.getByLabelText(
      "settings:axonHub.fields.emailPlaceholder",
    )
    fireEvent.change(emailInput, { target: { value: "  admin@example.com  " } })
    fireEvent.blur(emailInput)
    expect(mockUpdateAxonHubEmail).not.toHaveBeenCalled()

    const passwordInput = screen.getByLabelText(
      "settings:axonHub.fields.passwordPlaceholder",
    )
    fireEvent.change(passwordInput, { target: { value: "next-password" } })
    fireEvent.blur(passwordInput)

    await waitFor(() => {
      expect(mockUpdateAxonHubPassword).toHaveBeenCalledWith("next-password", {
        expectedLastUpdated: 1,
      })
    })

    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.reset" }),
    )

    await waitFor(() => {
      expect(mockResetAxonHubConfig).toHaveBeenCalledTimes(1)
    })
  })

  it("toggles password visibility and refreshes clean local values from context", async () => {
    let contextValue = createContextValue()
    mockedUseUserPreferencesContext.mockImplementation(() => contextValue)

    const { rerender } = render(<AxonHubSettings />)

    const passwordInput = screen.getByLabelText(
      "settings:axonHub.fields.passwordPlaceholder",
    )
    expect(passwordInput).toHaveAttribute("type", "password")

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:axonHub.fields.showPassword",
      }),
    )
    expect(passwordInput).toHaveAttribute("type", "text")

    contextValue = createContextValue({
      preferences: { lastUpdated: 2 },
      axonHubBaseUrl: "https://updated.example",
      axonHubEmail: "updated@example.com",
      axonHubPassword: "updated-password",
    })

    rerender(<AxonHubSettings />)

    await waitFor(() => {
      expect(
        screen.getByLabelText("settings:axonHub.fields.baseUrlPlaceholder"),
      ).toHaveValue("https://updated.example")
      expect(
        screen.getByLabelText("settings:axonHub.fields.emailPlaceholder"),
      ).toHaveValue("updated@example.com")
      expect(
        screen.getByLabelText("settings:axonHub.fields.passwordPlaceholder"),
      ).toHaveValue("updated-password")
    })
  })

  it("shows a missing-fields error without signing in", () => {
    mockedUseUserPreferencesContext.mockReturnValue(
      createContextValue({
        axonHubBaseUrl: "",
        axonHubEmail: "admin@example.com",
        axonHubPassword: "",
      }),
    )

    render(<AxonHubSettings />)

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:axonHub.validation.validate",
      }),
    )

    expect(toast.error).toHaveBeenCalledWith(
      "settings:axonHub.validation.missingFields",
    )
    expect(mockedSignIn).not.toHaveBeenCalled()
    expect(mockUpdateAxonHubConfig).not.toHaveBeenCalled()
  })

  it("validates trimmed credentials, disables the button in flight, and saves on success", async () => {
    const deferredSignIn = createDeferred<{ accessToken: string }>()
    mockedSignIn.mockReturnValue(deferredSignIn.promise)

    render(<AxonHubSettings />)

    fireEvent.change(
      screen.getByLabelText("settings:axonHub.fields.baseUrlPlaceholder"),
      {
        target: { value: "  https://validated.example  " },
      },
    )
    fireEvent.change(
      screen.getByLabelText("settings:axonHub.fields.emailPlaceholder"),
      {
        target: { value: "  validated@example.com  " },
      },
    )
    fireEvent.change(
      screen.getByLabelText("settings:axonHub.fields.passwordPlaceholder"),
      {
        target: { value: "validated-password" },
      },
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:axonHub.validation.validate",
      }),
    )

    await waitFor(() => {
      expect(mockedSignIn).toHaveBeenCalledWith({
        baseUrl: "https://validated.example",
        email: "validated@example.com",
        password: "validated-password",
      })
    })
    expect(
      screen.getByRole("button", {
        name: "settings:axonHub.validation.validating",
      }),
    ).toBeDisabled()

    deferredSignIn.resolve({ accessToken: "token" })

    await waitFor(() => {
      expect(mockUpdateAxonHubConfig).toHaveBeenCalledWith(
        {
          baseUrl: "https://validated.example",
          email: "validated@example.com",
          password: "validated-password",
        },
        {
          expectedLastUpdated: 1,
        },
      )
      expect(toast.success).toHaveBeenCalledWith(
        "settings:axonHub.validation.success",
      )
    })
  })

  it("surfaces sign-in failures without overwriting saved config", async () => {
    mockedSignIn.mockRejectedValue(new Error("invalid credentials"))

    render(<AxonHubSettings />)

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:axonHub.validation.validate",
      }),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "settings:axonHub.validation.failed",
      )
    })
    expect(mockUpdateAxonHubConfig).not.toHaveBeenCalled()
  })
})
