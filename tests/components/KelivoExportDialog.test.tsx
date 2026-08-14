import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { KelivoExportDialog } from "~/components/KelivoExportDialog"
import { KELIVO_GOOGLE_BASE_URL } from "~/services/integrations/kelivo"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const {
  copyKelivoProviderShareCodeMock,
  startProductAnalyticsActionMock,
  completeProductAnalyticsActionMock,
} = vi.hoisted(() => ({
  copyKelivoProviderShareCodeMock: vi.fn(),
  startProductAnalyticsActionMock: vi.fn(),
  completeProductAnalyticsActionMock: vi.fn(),
}))

vi.mock("~/services/integrations/kelivo", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("~/services/integrations/kelivo")>()
  return {
    ...original,
    copyKelivoProviderShareCode: (...args: unknown[]) =>
      copyKelivoProviderShareCodeMock(...args),
  }
})

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: (...args: unknown[]) =>
    startProductAnalyticsActionMock(...args),
}))

const ANALYTICS_CONTEXT = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
  actionId:
    PRODUCT_ANALYTICS_ACTION_IDS.CopyApiCredentialProfileKelivoImportCode,
  surfaceId:
    PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesRowActions,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
} as const

const INITIAL_VALUE = {
  apiType: API_TYPES.OPENAI_COMPATIBLE,
  name: "Example Provider",
  baseUrl: "https://api.example.invalid/gateway",
  apiKey: "sk-initial-example",
}

describe("KelivoExportDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    copyKelivoProviderShareCodeMock.mockResolvedValue(true)
    startProductAnalyticsActionMock.mockReturnValue({
      complete: completeProductAnalyticsActionMock,
    })
  })

  it("prefills every editable field and copies the user's exact values", async () => {
    const user = userEvent.setup()

    render(
      <KelivoExportDialog
        isOpen={true}
        onClose={() => {}}
        initialValue={INITIAL_VALUE}
        analyticsContext={ANALYTICS_CONTEXT}
      />,
    )

    const nameInput = await screen.findByLabelText(/dialog\.fields\.name/i)
    const apiKeyInput = screen.getByLabelText(/dialog\.fields\.apiKey/i)
    const baseUrlInput = screen.getByLabelText(/dialog\.fields\.baseUrl/i)
    expect(nameInput).toHaveValue("Example Provider")
    expect(apiKeyInput).toHaveValue("sk-initial-example")
    expect(baseUrlInput).toHaveValue("https://api.example.invalid/gateway/v1")
    const qrCode = screen.getByRole("img", {
      name: "ui:dialog.kelivo.mobileQrCodeLabel",
    })
    expect(qrCode).toBeVisible()
    expect(
      screen.getByText("ui:dialog.kelivo.desktopNotice.title"),
    ).toBeVisible()

    await user.click(
      await screen.findByRole("combobox", {
        name: "aiApiVerification:verifyDialog.meta.apiType",
      }),
    )
    expect(
      screen.getByText("ui:dialog.kelivo.protocolDescription"),
    ).toBeVisible()
    expect(
      screen.queryByRole("option", {
        name: "aiApiVerification:verifyDialog.apiTypes.openai",
      }),
    ).not.toBeInTheDocument()
    await user.click(
      await screen.findByRole("option", {
        name: "aiApiVerification:verifyDialog.apiTypes.anthropic",
      }),
    )
    await user.clear(nameInput)
    await user.type(nameInput, "Edited Provider")
    await user.clear(apiKeyInput)
    await user.type(apiKeyInput, "sk-edited-example")
    await user.clear(baseUrlInput)
    await user.type(baseUrlInput, "https://claude.example.invalid/custom")
    await user.click(
      screen.getByRole("button", {
        name: "ui:dialog.kelivo.actions.copy",
      }),
    )

    await waitFor(() => {
      expect(copyKelivoProviderShareCodeMock).toHaveBeenCalledWith({
        apiType: API_TYPES.ANTHROPIC,
        name: "Edited Provider",
        baseUrl: "https://claude.example.invalid/custom",
        apiKey: "sk-edited-example",
      })
    })
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith(
      ANALYTICS_CONTEXT,
    )
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )
  })

  it("shows Google's fixed endpoint while preserving the editable draft", async () => {
    const user = userEvent.setup()

    render(
      <KelivoExportDialog
        isOpen={true}
        onClose={() => {}}
        initialValue={INITIAL_VALUE}
        analyticsContext={ANALYTICS_CONTEXT}
      />,
    )

    await user.click(
      await screen.findByRole("combobox", {
        name: "aiApiVerification:verifyDialog.meta.apiType",
      }),
    )
    await user.click(
      await screen.findByRole("option", {
        name: "aiApiVerification:verifyDialog.apiTypes.google",
      }),
    )

    const baseUrlInput = await screen.findByLabelText(
      /dialog\.fields\.baseUrl/i,
    )
    expect(baseUrlInput).toBeDisabled()
    expect(baseUrlInput).toHaveValue(KELIVO_GOOGLE_BASE_URL)
    expect(
      screen.getByText("ui:dialog.kelivo.googleNotice.title"),
    ).toBeVisible()

    await user.click(
      screen.getByRole("button", {
        name: "ui:dialog.kelivo.actions.copy",
      }),
    )
    await waitFor(() => {
      expect(copyKelivoProviderShareCodeMock).toHaveBeenCalledWith({
        ...INITIAL_VALUE,
        apiType: API_TYPES.GOOGLE,
        baseUrl: KELIVO_GOOGLE_BASE_URL,
      })
    })

    await user.click(
      screen.getByRole("combobox", {
        name: "aiApiVerification:verifyDialog.meta.apiType",
      }),
    )
    await user.click(
      await screen.findByRole("option", {
        name: "aiApiVerification:verifyDialog.apiTypes.openaiCompatible",
      }),
    )
    expect(baseUrlInput).toBeEnabled()
    expect(baseUrlInput).toHaveValue("https://api.example.invalid/gateway/v1")
  })

  it("keeps copy disabled until the editable values are valid", async () => {
    const user = userEvent.setup()

    render(
      <KelivoExportDialog
        isOpen={true}
        onClose={() => {}}
        initialValue={INITIAL_VALUE}
        analyticsContext={ANALYTICS_CONTEXT}
      />,
    )

    const baseUrlInput = await screen.findByLabelText(
      /dialog\.fields\.baseUrl/i,
    )
    await user.clear(baseUrlInput)
    await user.type(baseUrlInput, "not-a-url")

    expect(baseUrlInput).toHaveAttribute("aria-invalid", "true")
    expect(
      await screen.findByRole("button", {
        name: "ui:dialog.kelivo.actions.copy",
      }),
    ).toBeDisabled()
    expect(screen.getByText("messages:kelivo.invalidBaseUrl")).toBeVisible()
    expect(
      screen.queryByRole("img", {
        name: "ui:dialog.kelivo.mobileQrCodeLabel",
      }),
    ).not.toBeInTheDocument()
  })

  it("tracks a failed copy without closing the editable dialog", async () => {
    copyKelivoProviderShareCodeMock.mockResolvedValue(false)
    const onClose = vi.fn()
    const user = userEvent.setup()

    render(
      <KelivoExportDialog
        isOpen={true}
        onClose={onClose}
        initialValue={INITIAL_VALUE}
        analyticsContext={ANALYTICS_CONTEXT}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.kelivo.actions.copy",
      }),
    )

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
      )
    })
    expect(onClose).not.toHaveBeenCalled()
  })
})
