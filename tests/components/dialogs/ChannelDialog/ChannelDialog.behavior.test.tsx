import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { MouseEvent, ReactNode } from "react"
import toast from "react-hot-toast"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ChannelDialog } from "~/components/dialogs/ChannelDialog"
import { AXON_HUB_CHANNEL_TYPE } from "~/constants/axonHub"
import { DIALOG_MODES } from "~/constants/dialogModes"
import { ChannelType } from "~/constants/managedSite"
import { AXON_HUB, NEW_API, OCTOPUS } from "~/constants/siteType"
import { CHANNEL_STATUS, type ChannelFormData } from "~/types/managedSite"

const {
  channelFormScenario,
  handleSubmitMock,
  handleTypeChangeMock,
  mockUserPreferences,
  requestDuplicateChannelWarningMock,
  updateFieldMock,
} = vi.hoisted(() => ({
  channelFormScenario: {
    formData: {
      name: "Alpha",
      type: 1,
      key: "sk-masked",
      base_url: "https://upstream.example.com",
      models: ["gpt-4"],
      groups: ["default"],
      priority: 2,
      weight: 3,
      status: 1,
    } as ChannelFormData,
    isFormValid: true,
    isSaving: false,
    isLoadingGroups: false,
    isLoadingModels: false,
    availableGroups: [{ label: "default", value: "default" }],
    availableModels: [
      { label: "gpt-4", value: "gpt-4" },
      { label: "gpt-4o", value: "gpt-4o" },
      { label: "claude-3", value: "claude-3" },
    ],
    isKeyFieldRequired: true,
    isBaseUrlRequired: false,
  },
  handleSubmitMock: vi.fn((event?: { preventDefault?: () => void }) =>
    event?.preventDefault?.(),
  ),
  handleTypeChangeMock: vi.fn(),
  mockUserPreferences: {
    managedSiteType: "new-api",
    newApiBaseUrl: "https://managed.example.com",
    newApiUserId: "1",
    newApiUsername: "admin",
    newApiPassword: "password",
    newApiTotpSecret: "",
  },
  requestDuplicateChannelWarningMock: vi.fn(),
  updateFieldMock: vi.fn(),
}))

const buildFormData = (
  overrides: Partial<ChannelFormData> = {},
): ChannelFormData => ({
  name: "Alpha",
  type: ChannelType.OpenAI,
  key: "sk-masked",
  base_url: "https://upstream.example.com",
  models: ["gpt-4"],
  groups: ["default"],
  priority: 2,
  weight: 3,
  status: CHANNEL_STATUS.Enable,
  ...overrides,
})

const resetChannelFormScenario = () => {
  channelFormScenario.formData = buildFormData()
  channelFormScenario.isFormValid = true
  channelFormScenario.isSaving = false
  channelFormScenario.isLoadingGroups = false
  channelFormScenario.isLoadingModels = false
  channelFormScenario.availableGroups = [{ label: "default", value: "default" }]
  channelFormScenario.availableModels = [
    { label: "gpt-4", value: "gpt-4" },
    { label: "gpt-4o", value: "gpt-4o" },
    { label: "claude-3", value: "claude-3" },
  ]
  channelFormScenario.isKeyFieldRequired = true
  channelFormScenario.isBaseUrlRequired = false
}

vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
  },
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options?.error ? `${key}:${String(options.error)}` : key,
  }),
}))

vi.mock(
  "~/components/dialogs/ChannelDialog/context/ChannelDialogContext",
  async () => {
    const actual = await vi.importActual<
      typeof import("~/components/dialogs/ChannelDialog/context/ChannelDialogContext")
    >("~/components/dialogs/ChannelDialog/context/ChannelDialogContext")

    return {
      ...actual,
      useChannelDialogContext: () => ({
        requestDuplicateChannelWarning: requestDuplicateChannelWarningMock,
      }),
    }
  },
)

vi.mock("~/components/dialogs/ChannelDialog/hooks/useChannelForm", async () => {
  const React = await import("react")

  return {
    useChannelForm: () => {
      const [formData, setFormData] = React.useState<ChannelFormData>(() => {
        const initialFormData = channelFormScenario.formData as ChannelFormData

        return {
          ...initialFormData,
          models: [...initialFormData.models],
          groups: [...initialFormData.groups],
        }
      })

      const updateField = (
        field: keyof ChannelFormData,
        value: ChannelFormData[keyof ChannelFormData],
      ) => {
        updateFieldMock(field, value)
        setFormData((current) => ({
          ...current,
          [field]: value,
        }))
      }

      const handleTypeChange = (value: number | string) => {
        handleTypeChangeMock(value)
        setFormData((current) => ({
          ...current,
          type: value as ChannelFormData["type"],
        }))
      }

      return {
        formData,
        updateField,
        handleTypeChange,
        handleSubmit: handleSubmitMock,
        isFormValid: channelFormScenario.isFormValid,
        isSaving: channelFormScenario.isSaving,
        isLoadingGroups: channelFormScenario.isLoadingGroups,
        isLoadingModels: channelFormScenario.isLoadingModels,
        availableGroups: channelFormScenario.availableGroups,
        availableModels: channelFormScenario.availableModels,
        isKeyFieldRequired: channelFormScenario.isKeyFieldRequired,
        isBaseUrlRequired: channelFormScenario.isBaseUrlRequired,
      }
    },
  }
})

vi.mock("~/contexts/UserPreferencesContext", async (importOriginal) => {
  const actual =
    (await importOriginal()) as typeof import("~/contexts/UserPreferencesContext")

  return {
    ...actual,
    useUserPreferencesContext: () => mockUserPreferences,
  }
})

vi.mock("~/components/ManagedSiteChannelAssessmentSignals", () => ({
  ManagedSiteChannelAssessmentSignalsRow: () => (
    <div>managed-site-assessment-signals</div>
  ),
}))

vi.mock("~/components/ui", async () => {
  const Button = ({
    children,
    disabled,
    onClick,
    type = "button",
  }: {
    children: ReactNode
    disabled?: boolean
    onClick?: (event: MouseEvent<HTMLButtonElement>) => void
    type?: "button" | "submit"
  }) => (
    <button disabled={disabled} onClick={onClick} type={type}>
      {children}
    </button>
  )

  return {
    Alert: ({
      children,
      description,
      title,
    }: {
      children?: ReactNode
      description?: ReactNode
      title?: ReactNode
    }) => (
      <div role="alert">
        <div>{title}</div>
        <div>{description}</div>
        {children}
      </div>
    ),
    Button,
    CompactMultiSelect: ({
      disabled,
      label,
      onChange,
      placeholder,
      selected,
    }: {
      disabled?: boolean
      label?: string
      onChange?: (values: string[]) => void
      placeholder?: string
      selected: string[]
    }) => {
      const kind = label ? "groups" : "models"

      return (
        <div data-testid={`${kind}-multi-select`}>
          {label ? <div>{label}</div> : null}
          <div data-testid={`${kind}-selected`}>{selected.join(",")}</div>
          <div data-testid={`${kind}-placeholder`}>{placeholder}</div>
          <div data-testid={`${kind}-disabled`}>
            {String(Boolean(disabled))}
          </div>
          <button
            disabled={disabled}
            onClick={() =>
              onChange?.(
                kind === "groups" ? ["ops", "staff"] : ["manual-model"],
              )
            }
            type="button"
          >
            {`set-${kind}`}
          </button>
        </div>
      )
    },
    IconButton: Button,
    Input: ({
      disabled,
      id,
      min,
      onChange,
      placeholder,
      readOnly,
      required,
      rightIcon,
      type = "text",
      value = "",
    }: {
      disabled?: boolean
      id?: string
      min?: string
      onChange?: (event: { target: { value: string } }) => void
      placeholder?: string
      readOnly?: boolean
      required?: boolean
      rightIcon?: ReactNode
      type?: string
      value?: number | string
    }) => (
      <div>
        <input
          disabled={disabled}
          id={id}
          min={min}
          onChange={(event) =>
            onChange?.({ target: { value: event.currentTarget.value } })
          }
          placeholder={placeholder}
          readOnly={readOnly}
          required={required}
          type={type}
          value={String(value)}
        />
        {rightIcon}
      </div>
    ),
    Label: ({
      children,
      htmlFor,
    }: {
      children: ReactNode
      htmlFor?: string
    }) => <label htmlFor={htmlFor}>{children}</label>,
    Modal: ({
      children,
      footer,
      header,
      isOpen,
      onClose,
    }: {
      children: ReactNode
      footer?: ReactNode
      header?: ReactNode
      isOpen: boolean
      onClose?: () => void
    }) =>
      isOpen ? (
        <div role="dialog">
          <button onClick={() => onClose?.()} type="button">
            modal-close
          </button>
          {header}
          {children}
          {footer}
        </div>
      ) : null,
    Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectContent: ({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    ),
    SelectItem: ({
      children,
      value,
    }: {
      children: ReactNode
      value: string
    }) => <div data-testid={`select-item-${value}`}>{children}</div>,
    SelectTrigger: ({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    ),
    SelectValue: ({ placeholder }: { placeholder?: ReactNode }) => (
      <span>{placeholder}</span>
    ),
  }
})

vi.mock(
  "~/features/ManagedSiteVerification/useNewApiManagedVerification",
  () => ({
    useNewApiManagedVerification: () => ({
      dialogState: {
        isOpen: false,
        step: "logging-in",
        request: null,
        code: "",
        errorMessage: undefined,
        isBusy: false,
        busyMessage: undefined,
      },
      setCode: vi.fn(),
      closeDialog: vi.fn(),
      openBaseUrl: vi.fn(),
      submitCode: vi.fn(),
      retryVerification: vi.fn(),
      patchRequestConfig: vi.fn(),
      openNewApiManagedVerification: vi.fn(),
    }),
  }),
)

vi.mock(
  "~/features/ManagedSiteVerification/NewApiManagedVerificationDialog",
  () => ({
    NewApiManagedVerificationDialog: () => null,
  }),
)

vi.mock("~/services/managedSites/providers/newApiSession", () => ({
  hasNewApiAuthenticatedBrowserSession: vi.fn(async () => false),
  hasNewApiLoginAssistCredentials: vi.fn(() => false),
  isNewApiVerifiedSessionActive: vi.fn(() => false),
}))

describe("ChannelDialog behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetChannelFormScenario()
    mockUserPreferences.managedSiteType = NEW_API
    mockUserPreferences.newApiBaseUrl = "https://managed.example.com"
    mockUserPreferences.newApiUserId = "1"
    mockUserPreferences.newApiUsername = "admin"
    mockUserPreferences.newApiPassword = "password"
    mockUserPreferences.newApiTotpSecret = ""
  })

  it("loads the real key in edit mode, reveals it, and updates the form", async () => {
    const user = userEvent.setup()
    let resolveRequest: (() => void) | undefined

    const onRequestRealKey = vi.fn(
      ({ setKey }: { setKey: (key: string) => void }) =>
        new Promise<void>((resolve) => {
          resolveRequest = () => {
            setKey("sk-real-channel-key")
            resolve()
          }
        }),
    )

    render(
      <ChannelDialog
        isOpen={true}
        onClose={vi.fn()}
        mode={DIALOG_MODES.EDIT}
        onRequestRealKey={onRequestRealKey}
      />,
    )

    await user.click(
      screen.getByRole("button", {
        name: "channelDialog:actions.loadRealKey",
      }),
    )

    expect(onRequestRealKey).toHaveBeenCalledTimes(1)
    expect(
      screen.getByRole("button", {
        name: "channelDialog:actions.loadingRealKey",
      }),
    ).toBeDisabled()

    resolveRequest?.()

    await waitFor(() => {
      expect(updateFieldMock).toHaveBeenCalledWith("key", "sk-real-channel-key")
      expect(
        screen.getByPlaceholderText("channelDialog:fields.key.placeholder"),
      ).toHaveValue("sk-real-channel-key")
    })

    expect(
      screen.getByPlaceholderText("channelDialog:fields.key.placeholder"),
    ).toHaveAttribute("type", "text")
  })

  it("keeps the masked key unchanged when the real-key request resolves without data", async () => {
    const user = userEvent.setup()
    const onRequestRealKey = vi.fn(async () => {})

    render(
      <ChannelDialog
        isOpen={true}
        onClose={vi.fn()}
        mode={DIALOG_MODES.EDIT}
        onRequestRealKey={onRequestRealKey}
      />,
    )

    await user.click(
      screen.getByRole("button", {
        name: "channelDialog:actions.loadRealKey",
      }),
    )

    await waitFor(() => {
      expect(onRequestRealKey).toHaveBeenCalledTimes(1)
      expect(
        screen.getByRole("button", {
          name: "channelDialog:actions.loadRealKey",
        }),
      ).toBeEnabled()
    })

    expect(updateFieldMock).not.toHaveBeenCalledWith("key", expect.anything())
    expect(
      screen.getByPlaceholderText("channelDialog:fields.key.placeholder"),
    ).toHaveValue("sk-masked")
    expect(
      screen.getByPlaceholderText("channelDialog:fields.key.placeholder"),
    ).toHaveAttribute("type", "password")
  })

  it("shows an error toast when loading the real key fails", async () => {
    const user = userEvent.setup()
    const onRequestRealKey = vi.fn(async () => {
      throw new Error("permission denied")
    })

    render(
      <ChannelDialog
        isOpen={true}
        onClose={vi.fn()}
        mode={DIALOG_MODES.EDIT}
        onRequestRealKey={onRequestRealKey}
      />,
    )

    await user.click(
      screen.getByRole("button", {
        name: "channelDialog:actions.loadRealKey",
      }),
    )

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledTimes(1)
    })

    expect(String(vi.mocked(toast.error).mock.calls[0]?.[0] ?? "")).toContain(
      "permission denied",
    )
    expect(
      screen.getByRole("button", {
        name: "channelDialog:actions.loadRealKey",
      }),
    ).toBeEnabled()
    expect(updateFieldMock).not.toHaveBeenCalledWith("key", expect.anything())
  })

  it("uses loading placeholders and disables bulk model actions while options are loading", () => {
    channelFormScenario.isLoadingModels = true
    channelFormScenario.isLoadingGroups = true

    render(<ChannelDialog isOpen={true} onClose={vi.fn()} />)

    expect(screen.getByTestId("models-placeholder")).toHaveTextContent(
      "channelDialog:fields.models.loading",
    )
    expect(screen.getByTestId("groups-placeholder")).toHaveTextContent(
      "channelDialog:fields.groups.loading",
    )
    expect(
      screen.getByRole("button", {
        name: "channelDialog:actions.selectAll",
      }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", {
        name: "channelDialog:actions.inverse",
      }),
    ).toBeDisabled()
  })

  it("applies inverse, select-all, and clear actions to the selected models", async () => {
    const user = userEvent.setup()

    render(<ChannelDialog isOpen={true} onClose={vi.fn()} />)

    expect(screen.getByTestId("models-selected")).toHaveTextContent("gpt-4")

    await user.click(
      screen.getByRole("button", {
        name: "channelDialog:actions.inverse",
      }),
    )

    await waitFor(() => {
      expect(screen.getByTestId("models-selected")).toHaveTextContent(
        "gpt-4o,claude-3",
      )
    })

    await user.click(
      screen.getByRole("button", {
        name: "channelDialog:actions.selectAll",
      }),
    )

    await waitFor(() => {
      expect(screen.getByTestId("models-selected")).toHaveTextContent(
        "gpt-4,gpt-4o,claude-3",
      )
    })

    await user.click(
      screen.getByRole("button", {
        name: "channelDialog:actions.deselectAll",
      }),
    )

    await waitFor(() => {
      expect(screen.getByTestId("models-selected")).toHaveTextContent("")
    })

    expect(updateFieldMock).toHaveBeenCalledWith("models", [
      "gpt-4o",
      "claude-3",
    ])
    expect(updateFieldMock).toHaveBeenCalledWith("models", [
      "gpt-4",
      "gpt-4o",
      "claude-3",
    ])
    expect(updateFieldMock).toHaveBeenCalledWith("models", [])
    expect(
      screen.getByRole("button", {
        name: "channelDialog:actions.deselectAll",
      }),
    ).toBeDisabled()
  })

  it("prevents view-mode form submission and hides edit-only actions", () => {
    const { container } = render(
      <ChannelDialog
        isOpen={true}
        onClose={vi.fn()}
        mode={DIALOG_MODES.VIEW}
        onRequestRealKey={vi.fn()}
      />,
    )

    expect(screen.getByText("channelDialog:title.view")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "common:actions.close" }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "channelDialog:actions.update" }),
    ).toBeNull()
    expect(
      screen.queryByRole("button", {
        name: "channelDialog:actions.loadRealKey",
      }),
    ).toBeNull()

    const form = container.querySelector("form")
    expect(form).toBeTruthy()

    const submitEvent = new Event("submit", {
      bubbles: true,
      cancelable: true,
    })

    form?.dispatchEvent(submitEvent)

    expect(submitEvent.defaultPrevented).toBe(true)
    expect(handleSubmitMock).not.toHaveBeenCalled()
  })

  it("shows a non-blocking advisory without assessment signals when none are available", () => {
    render(
      <ChannelDialog
        isOpen={true}
        onClose={vi.fn()}
        advisoryWarning={{
          kind: "reviewSuggested",
          title: "channelDialog:warnings.reviewSuggested.title",
          description: "channelDialog:warnings.reviewSuggested.description",
        }}
      />,
    )

    expect(
      screen.getByText("channelDialog:warnings.reviewSuggested.title"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("channelDialog:warnings.reviewSuggested.description"),
    ).toBeInTheDocument()
    expect(screen.queryByText("managed-site-assessment-signals")).toBeNull()
    expect(
      screen.queryByRole("button", {
        name: "channelDialog:warnings.verificationRequired.actions.verifyNow",
      }),
    ).toBeNull()
  })

  it("hides non-octopus fields when the managed site is octopus", () => {
    mockUserPreferences.managedSiteType = OCTOPUS

    render(<ChannelDialog isOpen={true} onClose={vi.fn()} />)

    expect(screen.getByTestId("models-multi-select")).toBeInTheDocument()
    expect(screen.queryByTestId("groups-multi-select")).toBeNull()
    expect(screen.queryByText("channelDialog:fields.priority.label")).toBeNull()
    expect(screen.queryByText("channelDialog:fields.weight.label")).toBeNull()
  })

  it("uses AxonHub string channel types and hides New API-only fields", () => {
    mockUserPreferences.managedSiteType = AXON_HUB
    channelFormScenario.formData = buildFormData({
      type: "custom_axonhub_type",
    })

    render(<ChannelDialog isOpen={true} onClose={vi.fn()} />)

    expect(
      screen.getByTestId(`select-item-${AXON_HUB_CHANNEL_TYPE.OPENAI}`),
    ).toHaveTextContent("OpenAI")
    expect(
      screen.getByTestId("select-item-custom_axonhub_type"),
    ).toHaveTextContent("custom_axonhub_type")
    expect(screen.getByTestId("models-multi-select")).toBeInTheDocument()
    expect(screen.queryByTestId("groups-multi-select")).toBeNull()
    expect(screen.queryByText("channelDialog:fields.priority.label")).toBeNull()
    expect(screen.queryByText("channelDialog:fields.weight.label")).toBeNull()
  })
})
