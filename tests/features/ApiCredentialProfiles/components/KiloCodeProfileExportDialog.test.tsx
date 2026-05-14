import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { KiloCodeProfileExportDialog } from "~/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const mockFetchOpenAICompatibleModelIds = vi.fn()
const mockBuildKiloCodeApiConfigs = vi.fn()
const mockBuildKiloCodeSettingsFile = vi.fn()
const toastSuccessMock = vi.fn()
const toastErrorMock = vi.fn()
const trackProductAnalyticsActionStartedMock = vi.fn()

vi.mock("~/services/apiService/openaiCompatible", () => ({
  fetchOpenAICompatibleModelIds: (...args: any[]) =>
    mockFetchOpenAICompatibleModelIds(...args),
}))

vi.mock("~/services/integrations/kiloCodeExport", () => ({
  buildKiloCodeApiConfigs: (...args: any[]) =>
    mockBuildKiloCodeApiConfigs(...args),
  buildKiloCodeSettingsFile: (...args: any[]) =>
    mockBuildKiloCodeSettingsFile(...args),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    success: (...args: any[]) => toastSuccessMock(...args),
    error: (...args: any[]) => toastErrorMock(...args),
  },
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
    surfaceId:
      PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesExportDialog,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  })
}

const PROFILE = {
  id: "profile-1",
  name: "Reusable Key",
  apiType: API_TYPES.OPENAI_COMPATIBLE,
  baseUrl: "https://profile.example.com/v1",
  apiKey: "sk-secret",
  tagIds: [],
  notes: "",
  createdAt: 1,
  updatedAt: 2,
} as any

describe("KiloCodeProfileExportDialog", () => {
  beforeEach(() => {
    mockFetchOpenAICompatibleModelIds.mockReset()
    mockBuildKiloCodeApiConfigs.mockReset()
    mockBuildKiloCodeSettingsFile.mockReset()
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
    trackProductAnalyticsActionStartedMock.mockReset()

    mockBuildKiloCodeApiConfigs.mockImplementation(({ selections }: any) => ({
      apiConfigs: [
        {
          name: "cfg-name",
          modelId: selections[0]?.modelId,
          baseUrl: selections[0]?.baseUrl,
        },
      ],
      profileNames: ["cfg-name"],
    }))
    mockBuildKiloCodeSettingsFile.mockImplementation(
      ({ currentApiConfigName, apiConfigs }: any) => ({
        currentApiConfigName,
        apiConfigs,
      }),
    )
  })

  it("loads and normalizes model ids, auto-selects the first option, and copies api configs", async () => {
    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce([
      " z-model ",
      "",
      "a-model",
    ])

    render(
      <KiloCodeProfileExportDialog
        isOpen={true}
        onClose={() => {}}
        profile={PROFILE}
      />,
    )

    await waitFor(() => {
      expect(mockFetchOpenAICompatibleModelIds).toHaveBeenCalledWith({
        baseUrl: "https://profile.example.com",
        apiKey: "sk-secret",
      })
    })

    await waitFor(() => {
      expect(mockBuildKiloCodeApiConfigs).toHaveBeenCalledWith(
        expect.objectContaining({
          selections: [
            expect.objectContaining({
              accountId: "profile-1",
              modelId: "a-model",
            }),
          ],
        }),
      )
    })

    const copyButton = await screen.findByRole("button", {
      name: "ui:dialog.kiloCode.actions.copyApiConfigs",
    })
    expect(copyButton).toBeEnabled()

    await user.click(copyButton)

    expectApiCredentialProfileActionTracked(
      PRODUCT_ANALYTICS_ACTION_IDS.CopyApiCredentialExportConfig,
    )
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1)
    })
    expect(writeText.mock.calls[0]?.[0]).toContain('"modelId": "a-model"')
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "ui:dialog.kiloCode.messages.copiedApiConfigs",
    )
  })

  it("shows the no-model notice and keeps export actions disabled when the upstream list is empty", async () => {
    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce([" ", ""])

    render(
      <KiloCodeProfileExportDialog
        isOpen={true}
        onClose={() => {}}
        profile={PROFILE}
      />,
    )

    expect(
      await screen.findByText("ui:dialog.kiloCode.messages.noModelsTitle"),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "ui:dialog.kiloCode.actions.copyApiConfigs",
      }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", {
        name: "ui:dialog.kiloCode.actions.downloadSettings",
      }),
    ).toBeDisabled()
  })

  it("shows a copy-failed toast when clipboard export fails", async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(
      new Error("clipboard blocked"),
    )
    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["gpt-4o-mini"])

    render(
      <KiloCodeProfileExportDialog
        isOpen={true}
        onClose={() => {}}
        profile={PROFILE}
      />,
    )

    const copyButton = await screen.findByRole("button", {
      name: "ui:dialog.kiloCode.actions.copyApiConfigs",
    })
    await waitFor(() => expect(copyButton).toBeEnabled())

    await user.click(copyButton)

    expectApiCredentialProfileActionTracked(
      PRODUCT_ANALYTICS_ACTION_IDS.CopyApiCredentialExportConfig,
    )
    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "ui:dialog.kiloCode.messages.copyFailed",
      )
    })
  })

  it("downloads a settings file and revokes the temporary object url", async () => {
    const user = userEvent.setup()
    const createObjectURLSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:test")
    const revokeObjectURLSpy = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {})
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {})

    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["gpt-4o-mini"])

    render(
      <KiloCodeProfileExportDialog
        isOpen={true}
        onClose={() => {}}
        profile={PROFILE}
      />,
    )

    const downloadButton = await screen.findByRole("button", {
      name: "ui:dialog.kiloCode.actions.downloadSettings",
    })
    await waitFor(() => expect(downloadButton).toBeEnabled())

    await user.click(downloadButton)

    expectApiCredentialProfileActionTracked(
      PRODUCT_ANALYTICS_ACTION_IDS.ExportApiCredentialSettingsFile,
    )
    await waitFor(() => {
      expect(mockBuildKiloCodeSettingsFile).toHaveBeenCalledWith({
        currentApiConfigName: "cfg-name",
        apiConfigs: [
          expect.objectContaining({
            modelId: "gpt-4o-mini",
          }),
        ],
      })
    })
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:test")
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "ui:dialog.kiloCode.messages.downloadedSettings",
    )
  })

  it("shows a download-failed toast when building the settings file throws", async () => {
    const user = userEvent.setup()
    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["gpt-4o-mini"])
    mockBuildKiloCodeSettingsFile.mockImplementationOnce(() => {
      throw new Error("disk blocked")
    })

    render(
      <KiloCodeProfileExportDialog
        isOpen={true}
        onClose={() => {}}
        profile={PROFILE}
      />,
    )

    const downloadButton = await screen.findByRole("button", {
      name: "ui:dialog.kiloCode.actions.downloadSettings",
    })
    await waitFor(() => expect(downloadButton).toBeEnabled())

    await user.click(downloadButton)

    expectApiCredentialProfileActionTracked(
      PRODUCT_ANALYTICS_ACTION_IDS.ExportApiCredentialSettingsFile,
    )
    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "ui:dialog.kiloCode.messages.downloadFailed",
      )
    })
  })
})
