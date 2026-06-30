import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState, type ComponentProps, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { NewApiManagedVerificationDialog } from "~/features/ManagedSiteVerification/NewApiManagedVerificationDialog"
import { NEW_API_MANAGED_VERIFICATION_STEPS } from "~/features/ManagedSiteVerification/useNewApiManagedVerification"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

const updateNewApiBaseUrlMock = vi.fn()
const updateNewApiUsernameMock = vi.fn()
const updateNewApiPasswordMock = vi.fn()
let currentNewApiBaseUrl = "https://managed.example"
let currentNewApiUsername = ""
let currentNewApiPassword = ""

const preferenceWriteSuccess = () => ({
  ok: true,
  preferences: {},
})

const preferenceWriteFailure = () => ({
  ok: false,
  reason: {
    type: "storage-error",
    error: new Error("save failed"),
  },
})

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: () => ({
    newApiBaseUrl: currentNewApiBaseUrl,
    newApiUsername: currentNewApiUsername,
    newApiPassword: currentNewApiPassword,
    updateNewApiBaseUrl: (...args: unknown[]) =>
      updateNewApiBaseUrlMock(...args),
    updateNewApiUsername: (...args: unknown[]) =>
      updateNewApiUsernameMock(...args),
    updateNewApiPassword: (...args: unknown[]) =>
      updateNewApiPasswordMock(...args),
  }),
}))

vi.mock("~/components/ui", async () => {
  const actual =
    await vi.importActual<typeof import("~/components/ui")>("~/components/ui")

  return {
    ...actual,
    InputOTP: ({
      children,
      onChange,
      value,
      pasteTransformer: _pasteTransformer,
      containerClassName: _containerClassName,
      ...props
    }: {
      children?: ReactNode
      onChange?: (value: string) => void
      value?: string
      [key: string]: unknown
    }) => (
      <div data-slot="input-otp">
        <input
          {...props}
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
        />
        {children}
      </div>
    ),
    InputOTPGroup: ({
      children,
      ...props
    }: {
      children?: ReactNode
      [key: string]: unknown
    }) => (
      <div data-slot="input-otp-group" {...props}>
        {children}
      </div>
    ),
    InputOTPSlot: ({
      index,
      ...props
    }: {
      index: number
      [key: string]: unknown
    }) => <div data-slot="input-otp-slot" data-index={index} {...props} />,
    InputOTPSeparator: ({ ...props }: { [key: string]: unknown }) => (
      <div data-slot="input-otp-separator" {...props} />
    ),
    Modal: ({
      isOpen,
      header,
      footer,
      children,
    }: {
      isOpen: boolean
      header?: ReactNode
      footer?: ReactNode
      children?: ReactNode
    }) =>
      isOpen ? (
        <div role="dialog">
          <div>{header}</div>
          <div>{children}</div>
          <div>{footer}</div>
        </div>
      ) : null,
  }
})

const BASE_REQUEST = {
  kind: "channel" as const,
  label: "Channel A",
  config: {
    baseUrl: "https://managed.example",
    userId: "1",
    username: "",
    password: "",
    totpSecret: "",
  },
}

const createProps = (
  overrides: Partial<
    ComponentProps<typeof NewApiManagedVerificationDialog>
  > = {},
): ComponentProps<typeof NewApiManagedVerificationDialog> => ({
  isOpen: true,
  step: NEW_API_MANAGED_VERIFICATION_STEPS.CREDENTIALS_MISSING,
  request: BASE_REQUEST,
  code: "",
  errorMessage: undefined,
  isBusy: false,
  busyMessage: undefined,
  onCodeChange: vi.fn(),
  onClose: vi.fn(),
  onSubmit: vi.fn(),
  onRetry: vi.fn(),
  onOpenSite: vi.fn(),
  onUpdateRequestConfig: vi.fn(),
  ...overrides,
})

describe("NewApiManagedVerificationDialog", () => {
  beforeEach(() => {
    document.elementFromPoint ??= (() =>
      null) as typeof document.elementFromPoint
    currentNewApiBaseUrl = "https://managed.example"
    currentNewApiUsername = ""
    currentNewApiPassword = ""
    updateNewApiBaseUrlMock.mockReset()
    updateNewApiUsernameMock.mockReset()
    updateNewApiPasswordMock.mockReset()
    updateNewApiBaseUrlMock.mockResolvedValue(preferenceWriteSuccess())
    updateNewApiUsernameMock.mockResolvedValue(preferenceWriteSuccess())
    updateNewApiPasswordMock.mockResolvedValue(preferenceWriteSuccess())
  })

  it("shows inline quick-config fields when login-assist settings are missing", () => {
    render(<NewApiManagedVerificationDialog {...createProps()} />)

    expect(
      screen.getByText("dialog.hints.openSettingsShortcut"),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText("settings:newApi.fields.usernameLabel"),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText("settings:newApi.fields.passwordLabel"),
    ).toBeInTheDocument()
  })

  it("saves missing credentials inline and retries verification", async () => {
    const user = userEvent.setup()
    const props = createProps()

    render(<NewApiManagedVerificationDialog {...props} />)

    await user.type(
      screen.getByLabelText("settings:newApi.fields.usernameLabel"),
      "admin",
    )
    await user.type(
      screen.getByLabelText("settings:newApi.fields.passwordLabel"),
      "secret",
    )
    await user.click(
      screen.getByRole("button", {
        name: "dialog.actions.saveAndRetry",
      }),
    )

    expect(updateNewApiUsernameMock).toHaveBeenCalledWith("admin")
    expect(updateNewApiPasswordMock).toHaveBeenCalledWith("secret")
    expect(props.onUpdateRequestConfig).toHaveBeenCalledWith({
      username: "admin",
      password: "secret",
    })
    expect(props.onRetry).toHaveBeenCalledTimes(1)
  })

  it("shows quick-config save failures without retrying verification", async () => {
    const user = userEvent.setup()
    updateNewApiUsernameMock.mockResolvedValue(preferenceWriteFailure())
    const props = createProps()

    render(<NewApiManagedVerificationDialog {...props} />)

    await user.type(
      screen.getByLabelText("settings:newApi.fields.usernameLabel"),
      "admin",
    )
    await user.type(
      screen.getByLabelText("settings:newApi.fields.passwordLabel"),
      "secret",
    )
    await user.click(
      screen.getByRole("button", {
        name: "dialog.actions.saveAndRetry",
      }),
    )

    expect(updateNewApiUsernameMock).toHaveBeenCalledWith("admin")
    expect(updateNewApiPasswordMock).not.toHaveBeenCalled()
    expect(props.onUpdateRequestConfig).not.toHaveBeenCalled()
    expect(props.onRetry).not.toHaveBeenCalled()
    expect(
      await screen.findByText("dialog.messages.quickConfigSaveFailed"),
    ).toBeInTheDocument()
  })

  it("patches stale request config even when storage already has the same values", async () => {
    const user = userEvent.setup()
    currentNewApiUsername = "admin"
    currentNewApiPassword = "secret"
    const props = createProps({
      request: {
        ...BASE_REQUEST,
        config: {
          ...BASE_REQUEST.config,
          username: "stale-user",
          password: "stale-pass",
        },
      },
    })

    render(<NewApiManagedVerificationDialog {...props} />)

    expect(
      screen.getByLabelText("settings:newApi.fields.usernameLabel"),
    ).toHaveValue("admin")
    expect(
      screen.getByLabelText("settings:newApi.fields.passwordLabel"),
    ).toHaveValue("secret")
    await user.click(
      screen.getByRole("button", {
        name: "dialog.actions.saveAndRetry",
      }),
    )

    expect(updateNewApiUsernameMock).not.toHaveBeenCalled()
    expect(updateNewApiPasswordMock).not.toHaveBeenCalled()
    expect(props.onUpdateRequestConfig).toHaveBeenCalledWith({
      username: "admin",
      password: "secret",
    })
    expect(props.onRetry).toHaveBeenCalledTimes(1)
  })

  it("shows inline base-url config when the base URL is missing", () => {
    render(
      <NewApiManagedVerificationDialog
        {...createProps({
          step: NEW_API_MANAGED_VERIFICATION_STEPS.FAILURE,
          request: {
            ...BASE_REQUEST,
            config: {
              ...BASE_REQUEST.config,
              baseUrl: "",
            },
          },
          errorMessage:
            "newApiManagedVerification:dialog.messages.missingBaseUrl",
        })}
      />,
    )

    expect(
      screen.getByLabelText("settings:newApi.fields.baseUrlLabel"),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "dialog.actions.retry",
      }),
    ).toBeNull()
  })

  it("patches a stale base-url request even when the stored base URL already matches", async () => {
    const user = userEvent.setup()
    currentNewApiBaseUrl = "https://managed.example"
    const props = createProps({
      step: NEW_API_MANAGED_VERIFICATION_STEPS.FAILURE,
      request: {
        ...BASE_REQUEST,
        config: {
          ...BASE_REQUEST.config,
          baseUrl: "",
        },
      },
      errorMessage: "newApiManagedVerification:dialog.messages.missingBaseUrl",
    })

    render(<NewApiManagedVerificationDialog {...props} />)

    await user.clear(
      screen.getByLabelText("settings:newApi.fields.baseUrlLabel"),
    )
    await user.type(
      screen.getByLabelText("settings:newApi.fields.baseUrlLabel"),
      "https://managed.example",
    )
    await user.click(
      screen.getByRole("button", {
        name: "dialog.actions.saveAndRetry",
      }),
    )

    expect(updateNewApiBaseUrlMock).not.toHaveBeenCalled()
    expect(props.onUpdateRequestConfig).toHaveBeenCalledWith({
      baseUrl: "https://managed.example",
    })
    expect(props.onRetry).toHaveBeenCalledTimes(1)
  })

  it("does not show an open-settings action during code entry", () => {
    render(
      <NewApiManagedVerificationDialog
        {...createProps({
          step: NEW_API_MANAGED_VERIFICATION_STEPS.LOGIN_2FA,
        })}
      />,
    )

    expect(
      screen.queryByRole("button", {
        name: "dialog.actions.saveAndRetry",
      }),
    ).toBeNull()
  })

  it("renders a shadcn-style otp input for verification code entry", () => {
    const { container } = render(
      <NewApiManagedVerificationDialog
        {...createProps({
          step: NEW_API_MANAGED_VERIFICATION_STEPS.LOGIN_2FA,
        })}
      />,
    )

    expect(screen.getByLabelText("dialog.fields.codeLabel")).toBeInTheDocument()
    expect(
      container.querySelectorAll('[data-slot="input-otp-slot"]'),
    ).toHaveLength(6)
    expect(
      container.querySelector('[data-slot="input-otp-separator"]'),
    ).not.toBeNull()
  })

  it("normalizes manual code input to six digits", async () => {
    const onCodeChange = vi.fn()

    function ControlledDialog() {
      const [code, setCode] = useState("")

      return (
        <NewApiManagedVerificationDialog
          {...createProps({
            step: NEW_API_MANAGED_VERIFICATION_STEPS.LOGIN_2FA,
            code,
            onCodeChange: (value) => {
              setCode(value)
              onCodeChange(value)
            },
          })}
        />
      )
    }

    render(<ControlledDialog />)

    fireEvent.change(screen.getByLabelText("dialog.fields.codeLabel"), {
      target: {
        value: "12a3 4-567",
      },
    })

    expect(onCodeChange).toHaveBeenLastCalledWith("123456")
  })

  it("keeps submit disabled until the verification code is complete", () => {
    const { rerender } = render(
      <NewApiManagedVerificationDialog
        {...createProps({
          step: NEW_API_MANAGED_VERIFICATION_STEPS.SECURE_VERIFICATION,
          code: "12345",
        })}
      />,
    )

    expect(
      screen.getByRole("button", {
        name: "dialog.actions.submitVerificationCode",
      }),
    ).toBeDisabled()

    rerender(
      <NewApiManagedVerificationDialog
        {...createProps({
          step: NEW_API_MANAGED_VERIFICATION_STEPS.SECURE_VERIFICATION,
          code: "123456",
        })}
      />,
    )

    expect(
      screen.getByRole("button", {
        name: "dialog.actions.submitVerificationCode",
      }),
    ).toBeEnabled()
  })
})
