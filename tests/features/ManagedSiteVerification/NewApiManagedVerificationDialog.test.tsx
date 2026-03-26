import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ComponentProps, ReactNode } from "react"
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

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: () => ({
    newApiBaseUrl: "https://managed.example",
    newApiUsername: "",
    newApiPassword: "",
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
    updateNewApiBaseUrlMock.mockReset()
    updateNewApiUsernameMock.mockReset()
    updateNewApiPasswordMock.mockReset()
    updateNewApiBaseUrlMock.mockResolvedValue(true)
    updateNewApiUsernameMock.mockResolvedValue(true)
    updateNewApiPasswordMock.mockResolvedValue(true)
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
})
