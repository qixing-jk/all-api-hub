import type { ReactNode } from "react"
import toast from "react-hot-toast"
import { beforeEach, describe, expect, it, vi } from "vitest"

import OctopusSettings from "~/features/BasicSettings/components/tabs/ManagedSite/OctopusSettings"
import { octopusAuthManager } from "~/services/apiService/octopus/auth"
import { showUpdateToast } from "~/utils/core/toastHelpers"
import { fireEvent, render, screen, waitFor } from "~~/tests/test-utils/render"

const {
  mockedUseUserPreferencesContext,
  mockUpdateOctopusBaseUrl,
  mockUpdateOctopusConfig,
  mockUpdateOctopusUsername,
  mockUpdateOctopusPassword,
  mockResetOctopusConfig,
} = vi.hoisted(() => ({
  mockedUseUserPreferencesContext: vi.fn(),
  mockUpdateOctopusBaseUrl: vi.fn(),
  mockUpdateOctopusConfig: vi.fn(),
  mockUpdateOctopusUsername: vi.fn(),
  mockUpdateOctopusPassword: vi.fn(),
  mockResetOctopusConfig: vi.fn(),
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

vi.mock("~/services/apiService/octopus/auth", () => ({
  octopusAuthManager: {
    validateConfig: vi.fn(),
  },
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
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
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
    value,
    placeholder,
    type,
    onChange,
    onBlur,
    rightIcon,
  }: {
    value?: string
    placeholder?: string
    type?: string
    onChange?: (event: { target: { value: string } }) => void
    onBlur?: (event: { target: { value: string } }) => void
    rightIcon?: ReactNode
  }) => (
    <div>
      <input
        aria-label={placeholder ?? type ?? "input"}
        type={type}
        value={value}
        onChange={(event) =>
          onChange?.({ target: { value: event.currentTarget.value } })
        }
        onBlur={(event) =>
          onBlur?.({ target: { value: event.currentTarget.value } })
        }
      />
      {rightIcon}
    </div>
  ),
}))

const mockedValidateConfig = octopusAuthManager.validateConfig as ReturnType<
  typeof vi.fn
>
const mockedShowUpdateToast = showUpdateToast as ReturnType<typeof vi.fn>

const createContextValue = (overrides: Record<string, unknown> = {}) => ({
  preferences: { lastUpdated: 1 },
  octopusBaseUrl: "https://octopus.example.com",
  octopusUsername: "admin",
  octopusPassword: "secret",
  updateOctopusBaseUrl: mockUpdateOctopusBaseUrl,
  updateOctopusConfig: mockUpdateOctopusConfig,
  updateOctopusUsername: mockUpdateOctopusUsername,
  updateOctopusPassword: mockUpdateOctopusPassword,
  resetOctopusConfig: mockResetOctopusConfig,
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

describe("OctopusSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockUpdateOctopusBaseUrl.mockResolvedValue(true)
    mockUpdateOctopusConfig.mockResolvedValue(true)
    mockUpdateOctopusUsername.mockResolvedValue(true)
    mockUpdateOctopusPassword.mockResolvedValue(true)
    mockResetOctopusConfig.mockResolvedValue(true)
    mockedValidateConfig.mockResolvedValue({ success: true })
    mockedUseUserPreferencesContext.mockReturnValue(createContextValue())
  })

  it("trims persisted field updates, skips unchanged values, and resets through SettingSection", async () => {
    render(<OctopusSettings />)

    const baseUrlInput = screen.getByLabelText(
      "settings:octopus.fields.baseUrlPlaceholder",
    )
    fireEvent.change(baseUrlInput, {
      target: { value: "  https://new-octopus.example.com  " },
    })
    fireEvent.blur(baseUrlInput)

    await waitFor(() => {
      expect(mockUpdateOctopusBaseUrl).toHaveBeenCalledWith(
        "https://new-octopus.example.com",
        {
          expectedLastUpdated: 1,
        },
      )
    })

    expect(mockedShowUpdateToast).toHaveBeenCalledWith(
      true,
      "settings:octopus.fields.baseUrlLabel",
    )

    const usernameInput = screen.getByLabelText(
      "settings:octopus.fields.usernamePlaceholder",
    )
    fireEvent.change(usernameInput, { target: { value: "  admin  " } })
    fireEvent.blur(usernameInput)

    expect(mockUpdateOctopusUsername).not.toHaveBeenCalled()

    const passwordInput = screen.getByLabelText(
      "settings:octopus.fields.passwordPlaceholder",
    )
    fireEvent.change(passwordInput, { target: { value: "  next-secret  " } })
    fireEvent.blur(passwordInput)

    await waitFor(() => {
      expect(mockUpdateOctopusPassword).toHaveBeenCalledWith("next-secret", {
        expectedLastUpdated: 1,
      })
    })

    expect(mockedShowUpdateToast).toHaveBeenCalledWith(
      true,
      "settings:octopus.fields.passwordLabel",
    )

    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.reset" }),
    )

    await waitFor(() => {
      expect(mockResetOctopusConfig).toHaveBeenCalledTimes(1)
    })
  })

  it("toggles password visibility and refreshes clean local inputs when context values change", async () => {
    let contextValue = createContextValue()
    mockedUseUserPreferencesContext.mockImplementation(() => contextValue)

    const { rerender } = render(<OctopusSettings />)

    const passwordInput = screen.getByLabelText(
      "settings:octopus.fields.passwordPlaceholder",
    )
    expect(passwordInput).toHaveAttribute("type", "password")

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:octopus.fields.showPassword",
      }),
    )
    expect(passwordInput).toHaveAttribute("type", "text")

    contextValue = createContextValue({
      preferences: { lastUpdated: 2 },
      octopusBaseUrl: "https://updated.example.com",
      octopusUsername: "updated-user",
      octopusPassword: "updated-password",
    })

    rerender(<OctopusSettings />)

    await waitFor(() => {
      expect(
        screen.getByLabelText("settings:octopus.fields.baseUrlPlaceholder"),
      ).toHaveValue("https://updated.example.com")
      expect(
        screen.getByLabelText("settings:octopus.fields.usernamePlaceholder"),
      ).toHaveValue("updated-user")
      expect(
        screen.getByLabelText("settings:octopus.fields.passwordPlaceholder"),
      ).toHaveValue("updated-password")
    })
  })

  it("keeps dirty local inputs during external refreshes and guards stale saves with the original snapshot version", async () => {
    let contextValue = createContextValue({
      preferences: { lastUpdated: 10 },
    })
    mockedUseUserPreferencesContext.mockImplementation(() => contextValue)
    mockUpdateOctopusBaseUrl.mockResolvedValue(false)

    const { rerender } = render(<OctopusSettings />)

    const baseUrlInput = screen.getByLabelText(
      "settings:octopus.fields.baseUrlPlaceholder",
    )
    fireEvent.change(baseUrlInput, {
      target: { value: "https://draft.example.com" },
    })

    contextValue = createContextValue({
      preferences: { lastUpdated: 11 },
      octopusBaseUrl: "https://imported.example.com",
      octopusUsername: "imported-user",
      octopusPassword: "imported-password",
    })

    rerender(<OctopusSettings />)

    expect(baseUrlInput).toHaveValue("https://draft.example.com")
    expect(
      screen.getByLabelText("settings:octopus.fields.usernamePlaceholder"),
    ).toHaveValue("admin")
    expect(
      screen.getByLabelText("settings:octopus.fields.passwordPlaceholder"),
    ).toHaveValue("secret")

    fireEvent.blur(baseUrlInput)

    await waitFor(() => {
      expect(mockUpdateOctopusBaseUrl).toHaveBeenCalledWith(
        "https://draft.example.com",
        {
          expectedLastUpdated: 10,
        },
      )
    })

    expect(mockedShowUpdateToast).toHaveBeenCalledWith(
      false,
      "settings:octopus.fields.baseUrlLabel",
    )
  })

  it("shows a missing-fields error without validating when required values are blank", async () => {
    mockedUseUserPreferencesContext.mockReturnValue(
      createContextValue({
        octopusBaseUrl: "",
        octopusUsername: "admin",
        octopusPassword: "",
      }),
    )

    render(<OctopusSettings />)

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:octopus.validation.validate",
      }),
    )

    expect(toast.error).toHaveBeenCalledWith(
      "settings:octopus.validation.missingFields",
    )
    expect(mockedValidateConfig).not.toHaveBeenCalled()
    expect(mockUpdateOctopusBaseUrl).not.toHaveBeenCalled()
    expect(mockUpdateOctopusConfig).not.toHaveBeenCalled()
  })

  it("validates trimmed config, disables the button in flight, and persists successful values", async () => {
    const deferredValidation = createDeferred<{ success: boolean }>()
    mockedValidateConfig.mockReturnValue(deferredValidation.promise)

    render(<OctopusSettings />)

    fireEvent.change(
      screen.getByLabelText("settings:octopus.fields.baseUrlPlaceholder"),
      {
        target: { value: "  https://validated.example.com  " },
      },
    )
    fireEvent.change(
      screen.getByLabelText("settings:octopus.fields.usernamePlaceholder"),
      {
        target: { value: "  validated-user  " },
      },
    )
    fireEvent.change(
      screen.getByLabelText("settings:octopus.fields.passwordPlaceholder"),
      {
        target: { value: "  validated-password  " },
      },
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:octopus.validation.validate",
      }),
    )

    await waitFor(() => {
      expect(mockedValidateConfig).toHaveBeenCalledWith({
        baseUrl: "https://validated.example.com",
        username: "validated-user",
        password: "validated-password",
      })
    })

    expect(
      screen.getByRole("button", {
        name: "settings:octopus.validation.validating",
      }),
    ).toBeDisabled()
    expect(
      screen.getByLabelText("settings:octopus.fields.baseUrlPlaceholder"),
    ).toHaveValue("https://validated.example.com")
    expect(
      screen.getByLabelText("settings:octopus.fields.usernamePlaceholder"),
    ).toHaveValue("validated-user")
    expect(
      screen.getByLabelText("settings:octopus.fields.passwordPlaceholder"),
    ).toHaveValue("validated-password")

    deferredValidation.resolve({ success: true })

    await waitFor(() => {
      expect(mockUpdateOctopusConfig).toHaveBeenCalledWith(
        {
          baseUrl: "https://validated.example.com",
          username: "validated-user",
          password: "validated-password",
        },
        {
          expectedLastUpdated: 1,
        },
      )
      expect(toast.success).toHaveBeenCalledWith(
        "settings:octopus.validation.success",
      )
    })

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "settings:octopus.validation.validate",
        }),
      ).not.toBeDisabled()
    })
  })

  it("surfaces validation failures from the auth manager without overwriting storage", async () => {
    mockedValidateConfig.mockResolvedValue({
      success: false,
      error: "Octopus auth rejected the credentials",
    })

    render(<OctopusSettings />)

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:octopus.validation.validate",
      }),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Octopus auth rejected the credentials",
      )
    })

    expect(mockUpdateOctopusConfig).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it("falls back to translated errors when validation fails without a message or throws", async () => {
    mockedValidateConfig.mockResolvedValueOnce({
      success: false,
      error: "",
    })

    render(<OctopusSettings />)

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:octopus.validation.validate",
      }),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "settings:octopus.validation.failed",
      )
    })

    mockedValidateConfig.mockRejectedValueOnce(new Error("network down"))

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:octopus.validation.validate",
      }),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "settings:octopus.validation.error",
      )
    })
  })

  it("persists trimmed usernames and skips unchanged base URL and password values", async () => {
    render(<OctopusSettings />)

    const baseUrlInput = screen.getByLabelText(
      "settings:octopus.fields.baseUrlPlaceholder",
    )
    const usernameInput = screen.getByLabelText(
      "settings:octopus.fields.usernamePlaceholder",
    )
    const passwordInput = screen.getByLabelText(
      "settings:octopus.fields.passwordPlaceholder",
    )

    fireEvent.change(baseUrlInput, {
      target: { value: "  https://octopus.example.com  " },
    })
    fireEvent.blur(baseUrlInput)

    fireEvent.change(usernameInput, {
      target: { value: "  next-admin  " },
    })
    fireEvent.blur(usernameInput)

    fireEvent.change(passwordInput, {
      target: { value: "  secret  " },
    })
    fireEvent.blur(passwordInput)

    await waitFor(() => {
      expect(mockUpdateOctopusUsername).toHaveBeenCalledWith("next-admin", {
        expectedLastUpdated: 1,
      })
    })

    expect(mockUpdateOctopusBaseUrl).not.toHaveBeenCalled()
    expect(mockUpdateOctopusPassword).not.toHaveBeenCalled()
    expect(mockedShowUpdateToast).toHaveBeenCalledWith(
      true,
      "settings:octopus.fields.usernameLabel",
    )
  })

  it("shows the generic update failure when validation passes but persistence is rejected", async () => {
    mockUpdateOctopusConfig.mockResolvedValue(false)

    render(<OctopusSettings />)

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:octopus.validation.validate",
      }),
    )

    await waitFor(() => {
      expect(mockUpdateOctopusConfig).toHaveBeenCalledWith(
        {
          baseUrl: "https://octopus.example.com",
          username: "admin",
          password: "secret",
        },
        {
          expectedLastUpdated: 1,
        },
      )
      expect(toast.error).toHaveBeenCalledWith("settings:messages.updateFailed")
    })
  })
})
