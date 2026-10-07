import type { ComponentProps, ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiCredentialProfileDialog } from "~/features/ApiCredentialProfiles/components/ApiCredentialProfileDialog"
import toast from "~/lib/notify"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { fireEvent, render, screen, waitFor } from "~~/tests/test-utils/render"

vi.mock("~/lib/notify", () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock("~/features/AccountManagement/components/TagPicker", () => ({
  TagPicker: () => <div data-testid="tag-picker" />,
}))

vi.mock("~/components/ui/DatePicker", () => ({
  DatePicker: ({ id, value, onChange, disabled }: any) => (
    <input
      id={id}
      value={value ?? ""}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
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

const trackProductAnalyticsActionStartedMock = vi.fn()
const requestPermissionDetailedMock = vi.hoisted(() => vi.fn())

vi.mock("~/services/permissions/permissionManager", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("~/services/permissions/permissionManager")
  >()),
  requestPermissionDetailed: requestPermissionDetailedMock,
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  trackProductAnalyticsActionStarted: (...args: any[]) =>
    trackProductAnalyticsActionStartedMock(...args),
}))

const expectApiCredentialProfileActionTracked = (
  actionId: (typeof PRODUCT_ANALYTICS_ACTION_IDS)[keyof typeof PRODUCT_ANALYTICS_ACTION_IDS],
) => {
  expect(trackProductAnalyticsActionStartedMock).toHaveBeenCalledWith({
    featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
    actionId,
    surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesDialog,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  })
}

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
  it.each([
    ["name", "nameRequired"],
    ["apiKey", "keyRequired"],
    ["baseUrl", "baseUrlInvalid"],
  ])(
    "rejects missing %s before persisting a profile",
    async (field, errorKey) => {
      const { onSave } = renderDialog({
        profile: buildProfile({ [field]: "" }),
      })

      fireEvent.click(
        screen.getByRole("button", { name: "common:actions.save" }),
      )

      expect(
        await screen.findByText(
          `apiCredentialProfiles:dialog.errors.${errorKey}`,
        ),
      ).toBeVisible()
      expect(onSave).not.toHaveBeenCalled()
    },
  )

  it("retains profile edits and restores Save after persistence throws", async () => {
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(new Error("Storage unavailable"))
    renderDialog({ profile: buildProfile(), onSave })

    fireEvent.click(screen.getByRole("button", { name: "common:actions.save" }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "apiCredentialProfiles:messages.saveFailed",
      ),
    )
    expect(
      screen.getByPlaceholderText(
        "apiCredentialProfiles:dialog.placeholders.name",
      ),
    ).toHaveValue("Profile")
    expect(
      screen.getByRole("button", { name: "common:actions.save" }),
    ).not.toBeDisabled()
  })
  it("places labeled request header fields after the credential settings", () => {
    renderDialog({
      profile: buildProfile({ requestHeaders: { "x-client": "test" } }),
    })
    const headerName = screen.getByLabelText(
      "apiCredentialProfiles:dialog.requestHeaders.name",
    )
    const headerValue = screen.getByLabelText(
      "apiCredentialProfiles:dialog.requestHeaders.value",
    )
    expect(headerName).toHaveAttribute("id")
    expect(headerValue).toHaveAttribute("id")
    const telemetry = screen.getByLabelText(
      "apiCredentialProfiles:dialog.fields.telemetryPreset",
    )
    expect(
      telemetry.compareDocumentPosition(headerName) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
  it("edits masked request headers and can clear them", async () => {
    const { onSave } = renderDialog({
      profile: buildProfile({ requestHeaders: { "x-client": "old" } }),
    })
    const value = screen.getByLabelText(
      "apiCredentialProfiles:dialog.requestHeaders.value",
    )
    expect(value).toHaveAttribute("type", "password")
    fireEvent.change(value, { target: { value: "new" } })
    fireEvent.click(screen.getByRole("button", { name: "common:actions.save" }))
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ requestHeaders: { "x-client": "new" } }),
      ),
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "apiCredentialProfiles:dialog.requestHeaders.remove",
      }),
    )
    fireEvent.click(screen.getByRole("button", { name: "common:actions.save" }))
    await waitFor(() =>
      expect(onSave).toHaveBeenLastCalledWith(
        expect.objectContaining({ requestHeaders: {} }),
      ),
    )
  })

  it("requests UA permission from Save and retains edits when permission is denied", async () => {
    requestPermissionDetailedMock
      .mockResolvedValueOnce({ success: false })
      .mockResolvedValueOnce({ success: true })
    const { onSave } = renderDialog({
      profile: buildProfile({ requestHeaders: { "user-agent": "client/1" } }),
    })
    const headerSection = screen
      .getByText("apiCredentialProfiles:dialog.requestHeaders.title")
      .closest("details")!
    headerSection.open = false
    fireEvent.click(screen.getByRole("button", { name: "common:actions.save" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "apiCredentialProfiles:dialog.errors.userAgentPermission",
    )
    expect(headerSection.contains(screen.getByRole("alert"))).toBe(false)
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "common:actions.save" }))
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          requestHeaders: { "user-agent": "client/1" },
        }),
      ),
    )
    expect(requestPermissionDetailedMock).toHaveBeenCalledWith(
      "declarativeNetRequestWithHostAccess",
    )
  })

  it("rejects duplicate and browser-controlled header names before saving", async () => {
    const { onSave } = renderDialog({ profile: buildProfile() })
    fireEvent.click(
      screen.getByRole("button", {
        name: "apiCredentialProfiles:dialog.requestHeaders.add",
      }),
    )
    fireEvent.change(
      screen.getByLabelText("apiCredentialProfiles:dialog.requestHeaders.name"),
      { target: { value: "Host" } },
    )
    fireEvent.change(
      screen.getByLabelText(
        "apiCredentialProfiles:dialog.requestHeaders.value",
      ),
      { target: { value: "other.example" } },
    )
    fireEvent.click(screen.getByRole("button", { name: "common:actions.save" }))
    expect(onSave).not.toHaveBeenCalled()
    expect(
      await screen.findByText(
        "apiCredentialProfiles:dialog.errors.requestHeadersInvalid",
      ),
    ).toBeInTheDocument()
  })
  it("retains independent header rows and rejects duplicate names regardless of case", async () => {
    const { onSave } = renderDialog({ profile: buildProfile() })
    const add = screen.getByRole("button", {
      name: "apiCredentialProfiles:dialog.requestHeaders.add",
    })
    fireEvent.click(add)
    fireEvent.click(add)
    const names = screen.getAllByLabelText(
      "apiCredentialProfiles:dialog.requestHeaders.name",
    )
    const values = screen.getAllByLabelText(
      "apiCredentialProfiles:dialog.requestHeaders.value",
    )
    fireEvent.change(names[0]!, { target: { value: "X-Client" } })
    fireEvent.change(values[0]!, { target: { value: "same-value" } })
    fireEvent.change(names[1]!, { target: { value: "x-client" } })
    fireEvent.change(values[1]!, { target: { value: "same-value" } })
    fireEvent.click(screen.getByRole("button", { name: "common:actions.save" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "apiCredentialProfiles:dialog.errors.requestHeadersInvalid",
    )
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.change(names[1]!, { target: { value: "X-Tenant" } })
    fireEvent.click(screen.getByRole("button", { name: "common:actions.save" }))
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          requestHeaders: {
            "x-client": "same-value",
            "x-tenant": "same-value",
          },
        }),
      ),
    )
  })
  beforeEach(() => {
    vi.clearAllMocks()
    trackProductAnalyticsActionStartedMock.mockReset()
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
    fireEvent.change(
      screen.getByLabelText("apiCredentialProfiles:dialog.fields.expiresAt"),
      {
        target: { value: "2026-07-31" },
      },
    )

    fireEvent.click(screen.getByRole("button", { name: "common:actions.save" }))

    await waitFor(() => {
      expectApiCredentialProfileActionTracked(
        PRODUCT_ANALYTICS_ACTION_IDS.CreateApiCredentialProfile,
      )
    })
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        id: undefined,
        name: "Auto profile",
        apiType: "openai-compatible",
        baseUrl: "https://auto.example.com",
        apiKey: "sk-auto",
        tagIds: [],
        notes: "",
        sourceUrl: "",
        expiresAt: new Date(2026, 6, 31).getTime(),
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
        target: { value: "ftp://telemetry.example.com/usage/read-only" },
      },
    )
    fireEvent.change(
      screen.getAllByPlaceholderText(
        "apiCredentialProfiles:dialog.placeholders.telemetryJsonPath",
      )[0]!,
      {
        target: { value: "data..balance" },
      },
    )

    fireEvent.click(screen.getByRole("button", { name: "common:actions.save" }))

    expect(onSave).not.toHaveBeenCalled()
    expect(
      screen.getByText(
        "apiCredentialProfiles:dialog.errors.telemetryEndpointInvalid",
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "apiCredentialProfiles:dialog.errors.telemetryJsonPathInvalid",
      ),
    ).toBeInTheDocument()

    fireEvent.change(
      screen.getByPlaceholderText(
        "apiCredentialProfiles:dialog.placeholders.telemetryEndpoint",
      ),
      {
        target: { value: "https://telemetry.example.com/usage/read-only" },
      },
    )
    fireEvent.change(
      screen.getByPlaceholderText(
        "apiCredentialProfiles:dialog.placeholders.telemetryBearerToken",
      ),
      {
        target: { value: " dedicated-telemetry-token " },
      },
    )
    fireEvent.change(
      screen.getAllByPlaceholderText(
        "apiCredentialProfiles:dialog.placeholders.telemetryJsonPath",
      )[0]!,
      {
        target: { value: "data. balance" },
      },
    )

    fireEvent.click(screen.getByRole("button", { name: "common:actions.save" }))

    await waitFor(() => {
      expectApiCredentialProfileActionTracked(
        PRODUCT_ANALYTICS_ACTION_IDS.CreateApiCredentialProfile,
      )
    })
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          telemetryConfig: {
            mode: "customReadOnlyEndpoint",
            customEndpoint: {
              endpoint: "https://telemetry.example.com/usage/read-only",
              bearerToken: "dedicated-telemetry-token",
              jsonPaths: {
                balanceUsd: "data.balance",
              },
            },
          },
        }),
      )
    })
  })

  it("omits a whitespace-only custom telemetry bearer token", async () => {
    const { onSave } = renderDialog()

    fireEvent.change(
      screen.getByPlaceholderText(
        "apiCredentialProfiles:dialog.placeholders.name",
      ),
      { target: { value: "Unauthenticated telemetry" } },
    )
    fireEvent.change(
      screen.getByPlaceholderText(
        "apiCredentialProfiles:dialog.placeholders.baseUrl",
      ),
      { target: { value: "https://api.example.com" } },
    )
    fireEvent.change(
      screen.getByPlaceholderText(
        "apiCredentialProfiles:dialog.placeholders.apiKey",
      ),
      { target: { value: "sk-profile" } },
    )
    fireEvent.change(
      screen.getByLabelText(
        "apiCredentialProfiles:dialog.fields.telemetryPreset",
      ),
      { target: { value: "customReadOnlyEndpoint" } },
    )
    fireEvent.change(
      screen.getByPlaceholderText(
        "apiCredentialProfiles:dialog.placeholders.telemetryEndpoint",
      ),
      { target: { value: "https://telemetry.example.com/usage" } },
    )
    fireEvent.change(
      screen.getByPlaceholderText(
        "apiCredentialProfiles:dialog.placeholders.telemetryBearerToken",
      ),
      { target: { value: "   " } },
    )
    fireEvent.change(
      screen.getAllByPlaceholderText(
        "apiCredentialProfiles:dialog.placeholders.telemetryJsonPath",
      )[0]!,
      { target: { value: "data.balance" } },
    )

    fireEvent.click(screen.getByRole("button", { name: "common:actions.save" }))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          telemetryConfig: {
            mode: "customReadOnlyEndpoint",
            customEndpoint: {
              endpoint: "https://telemetry.example.com/usage",
              jsonPaths: { balanceUsd: "data.balance" },
            },
          },
        }),
      )
    })
  })

  it("saves the source page URL (trimmed)", async () => {
    const { onSave } = renderDialog()

    fireEvent.change(
      screen.getByPlaceholderText(
        "apiCredentialProfiles:dialog.placeholders.name",
      ),
      { target: { value: "Shared credential" } },
    )
    fireEvent.change(
      screen.getByPlaceholderText(
        "apiCredentialProfiles:dialog.placeholders.baseUrl",
      ),
      { target: { value: "https://shared.example.com" } },
    )
    fireEvent.change(
      screen.getByPlaceholderText(
        "apiCredentialProfiles:dialog.placeholders.apiKey",
      ),
      { target: { value: "sk-shared" } },
    )
    fireEvent.change(
      screen.getByPlaceholderText(
        "apiCredentialProfiles:dialog.placeholders.sourceUrl",
      ),
      { target: { value: "  https://forum.example.com/t/9?p=2  " } },
    )

    fireEvent.click(screen.getByRole("button", { name: "common:actions.save" }))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceUrl: "https://forum.example.com/t/9?p=2",
        }),
      )
    })
  })

  it("replays the source page URL when editing an existing profile", () => {
    renderDialog({
      profile: buildProfile({
        sourceUrl: "https://forum.example.com/t/9?p=2",
      }),
    })

    expect(
      screen.getByPlaceholderText(
        "apiCredentialProfiles:dialog.placeholders.sourceUrl",
      ),
    ).toHaveValue("https://forum.example.com/t/9?p=2")
  })

  it("replays stored telemetry config when editing an existing profile", () => {
    renderDialog({
      profile: buildProfile({
        expiresAt: new Date(2026, 6, 31).getTime(),
        telemetryConfig: {
          mode: "customReadOnlyEndpoint",
          customEndpoint: {
            endpoint: "/usage/totals",
            bearerToken: "saved-telemetry-token",
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
      screen.getByLabelText("apiCredentialProfiles:dialog.fields.expiresAt"),
    ).toHaveValue("2026-07-31")
    expect(
      screen.getByLabelText(
        "apiCredentialProfiles:dialog.fields.telemetryPreset",
      ),
    ).toHaveValue("customReadOnlyEndpoint")
    expect(screen.getByDisplayValue("/usage/totals")).toHaveValue(
      "/usage/totals",
    )
    expect(screen.getByDisplayValue("saved-telemetry-token")).toHaveAttribute(
      "type",
      "password",
    )
    expect(screen.getByDisplayValue("data.balance")).toHaveValue("data.balance")
    expect(screen.getByDisplayValue("data.total.used")).toHaveValue(
      "data.total.used",
    )
  })

  it("rejects expanded-year profile expiration values when saving", async () => {
    const { onSave } = renderDialog()

    fireEvent.change(
      screen.getByPlaceholderText(
        "apiCredentialProfiles:dialog.placeholders.name",
      ),
      {
        target: { value: "Expanded year profile" },
      },
    )
    fireEvent.change(
      screen.getByPlaceholderText(
        "apiCredentialProfiles:dialog.placeholders.baseUrl",
      ),
      {
        target: { value: "https://expanded.example.com" },
      },
    )
    fireEvent.change(
      screen.getByPlaceholderText(
        "apiCredentialProfiles:dialog.placeholders.apiKey",
      ),
      {
        target: { value: "sk-expanded" },
      },
    )
    fireEvent.change(
      screen.getByLabelText("apiCredentialProfiles:dialog.fields.expiresAt"),
      {
        target: { value: "202607-01-01" },
      },
    )

    fireEvent.click(screen.getByRole("button", { name: "common:actions.save" }))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          expiresAt: null,
        }),
      )
    })
  })

  it("tracks saving an edited profile", async () => {
    const { onSave } = renderDialog({
      profile: buildProfile(),
    })

    fireEvent.change(
      screen.getByPlaceholderText(
        "apiCredentialProfiles:dialog.placeholders.name",
      ),
      {
        target: { value: "Renamed profile" },
      },
    )

    fireEvent.click(screen.getByRole("button", { name: "common:actions.save" }))

    await waitFor(() => {
      expectApiCredentialProfileActionTracked(
        PRODUCT_ANALYTICS_ACTION_IDS.UpdateApiCredentialProfile,
      )
    })
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "profile-1",
          name: "Renamed profile",
        }),
      )
    })
  })
})
