import type { ComponentProps, ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiCredentialProfileDialog } from "~/features/ApiCredentialProfiles/components/ApiCredentialProfileDialog"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { fireEvent, render, screen, waitFor } from "~~/tests/test-utils/render"

vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock("@headlessui/react", () => ({
  DialogTitle: ({
    children,
    className,
  }: {
    children: ReactNode
    className?: string
  }) => <div className={className}>{children}</div>,
}))

vi.mock("~/features/AccountManagement/components/TagPicker", () => ({
  TagPicker: () => <div data-testid="tag-picker" />,
}))

vi.mock("~/components/ui/Dialog/Modal", () => ({
  Modal: ({
    children,
    footer,
    header,
    isOpen,
  }: {
    children: ReactNode
    footer?: ReactNode
    header?: ReactNode
    isOpen: boolean
  }) =>
    isOpen ? (
      <div>
        <div>{header}</div>
        <div>{children}</div>
        <div>{footer}</div>
      </div>
    ) : null,
}))

vi.mock("~/components/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/components/ui")>()

  return {
    ...actual,
    SearchableSelect: ({
      "aria-label": ariaLabel,
      id,
      onChange,
      options,
      value,
      disabled,
    }: {
      "aria-label"?: string
      id?: string
      onChange: (value: string) => void
      options: Array<{ value: string; label: string }>
      value: string
      disabled?: boolean
    }) => (
      <select
        aria-label={ariaLabel}
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    ),
  }
})

vi.mock("~/services/verification/aiApiVerification/i18n", () => ({
  getApiVerificationApiTypeLabel: (_t: unknown, apiType: string) => apiType,
}))

function buildProfile(
  overrides: Partial<ApiCredentialProfile> = {},
): ApiCredentialProfile {
  return {
    id: "profile-1",
    name: "Profile",
    apiType: "openai-compatible",
    baseUrl: "https://api.example.com",
    apiKey: "sk-profile",
    tagIds: [],
    notes: "Saved notes",
    telemetryConfig: { mode: "auto" },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

function renderDialog(
  props: Partial<ComponentProps<typeof ApiCredentialProfileDialog>> = {},
) {
  const onSave = props.onSave ?? vi.fn().mockResolvedValue(undefined)

  render(
    <ApiCredentialProfileDialog
      isOpen
      onClose={vi.fn()}
      tags={[]}
      createTag={vi.fn()}
      renameTag={vi.fn()}
      deleteTag={vi.fn()}
      onSave={onSave}
      {...props}
    />,
    {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    },
  )

  return { onSave }
}

describe("ApiCredentialProfileDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("saves new profiles with auto telemetry by default", async () => {
    const { onSave } = renderDialog()

    fireEvent.change(
      screen.getByPlaceholderText(
        "apiCredentialProfiles:dialog.placeholders.name",
      ),
      {
        target: { value: "Auto profile" },
      },
    )
    fireEvent.change(
      screen.getByPlaceholderText(
        "apiCredentialProfiles:dialog.placeholders.baseUrl",
      ),
      {
        target: { value: "https://auto.example.com/v1/models" },
      },
    )
    fireEvent.change(
      screen.getByPlaceholderText(
        "apiCredentialProfiles:dialog.placeholders.apiKey",
      ),
      {
        target: { value: "sk-auto" },
      },
    )

    fireEvent.click(screen.getByRole("button", { name: "common:actions.save" }))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        id: undefined,
        name: "Auto profile",
        apiType: "openai-compatible",
        baseUrl: "https://auto.example.com",
        apiKey: "sk-auto",
        tagIds: [],
        notes: "",
        telemetryConfig: {
          mode: "auto",
        },
      })
    })
  })

  it("validates and saves custom telemetry endpoint mappings", async () => {
    const { onSave } = renderDialog()

    fireEvent.change(
      screen.getByPlaceholderText(
        "apiCredentialProfiles:dialog.placeholders.name",
      ),
      {
        target: { value: "Custom profile" },
      },
    )
    fireEvent.change(
      screen.getByPlaceholderText(
        "apiCredentialProfiles:dialog.placeholders.baseUrl",
      ),
      {
        target: { value: "https://custom.example.com" },
      },
    )
    fireEvent.change(
      screen.getByPlaceholderText(
        "apiCredentialProfiles:dialog.placeholders.apiKey",
      ),
      {
        target: { value: "sk-custom" },
      },
    )
    fireEvent.change(
      screen.getByLabelText(
        "apiCredentialProfiles:dialog.fields.telemetryPreset",
      ),
      {
        target: { value: "customReadOnlyEndpoint" },
      },
    )

    fireEvent.click(screen.getByRole("button", { name: "common:actions.save" }))

    expect(onSave).not.toHaveBeenCalled()
    expect(
      screen.getByText(
        "apiCredentialProfiles:dialog.errors.telemetryEndpointRequired",
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "apiCredentialProfiles:dialog.errors.telemetryJsonPathRequired",
      ),
    ).toBeInTheDocument()

    fireEvent.change(
      screen.getByPlaceholderText(
        "apiCredentialProfiles:dialog.placeholders.telemetryEndpoint",
      ),
      {
        target: { value: "/usage/read-only" },
      },
    )
    fireEvent.change(
      screen.getAllByPlaceholderText(
        "apiCredentialProfiles:dialog.placeholders.telemetryJsonPath",
      )[0]!,
      {
        target: { value: "data.balance" },
      },
    )

    fireEvent.click(screen.getByRole("button", { name: "common:actions.save" }))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          telemetryConfig: {
            mode: "customReadOnlyEndpoint",
            customEndpoint: {
              endpoint: "/usage/read-only",
              jsonPaths: {
                balanceUsd: "data.balance",
              },
            },
          },
        }),
      )
    })
  })

  it("replays stored telemetry config when editing an existing profile", () => {
    renderDialog({
      profile: buildProfile({
        telemetryConfig: {
          mode: "customReadOnlyEndpoint",
          customEndpoint: {
            endpoint: "/usage/totals",
            jsonPaths: {
              balanceUsd: "data.balance",
              totalUsedUsd: "data.total.used",
            },
          },
        },
      }),
    })

    expect(screen.getByDisplayValue("Profile")).toHaveValue("Profile")
    expect(
      screen.getByLabelText(
        "apiCredentialProfiles:dialog.fields.telemetryPreset",
      ),
    ).toHaveValue("customReadOnlyEndpoint")
    expect(screen.getByDisplayValue("/usage/totals")).toHaveValue(
      "/usage/totals",
    )
    expect(screen.getByDisplayValue("data.balance")).toHaveValue("data.balance")
    expect(screen.getByDisplayValue("data.total.used")).toHaveValue(
      "data.total.used",
    )
  })
})
