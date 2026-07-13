import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { KiloCodeProfileExportDialog } from "~/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog"
import { KILO_CODE_EXPORT_TARGETS } from "~/services/integrations/kiloCodeExport"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_KILO_CODE_EXPORT_TARGETS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { expectKiloCodeUsageGuidance } from "~~/tests/test-utils/kiloCodeExportGuidance"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const mockFetchOpenAICompatibleModelIds = vi.fn()
const mockBuildKiloCodeExportOutput = vi.fn()
const toastSuccessMock = vi.fn()
const toastErrorMock = vi.fn()
const completeProductAnalyticsActionMock = vi.fn()
const startProductAnalyticsActionMock = vi.fn()

vi.mock("~/services/aiApi/openaiCompatible", () => ({
  fetchOpenAICompatibleModelIds: (...args: any[]) =>
    mockFetchOpenAICompatibleModelIds(...args),
}))

vi.mock("~/services/integrations/kiloCodeExportPolicy", () => ({
  buildKiloCodeExportOutput: (...args: any[]) =>
    mockBuildKiloCodeExportOutput(...args),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    success: (...args: any[]) => toastSuccessMock(...args),
    error: (...args: any[]) => toastErrorMock(...args),
  },
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: (...args: any[]) =>
    startProductAnalyticsActionMock(...args),
}))

const expectApiCredentialProfileActionStarted = (
  actionId: (typeof PRODUCT_ANALYTICS_ACTION_IDS)[keyof typeof PRODUCT_ANALYTICS_ACTION_IDS],
) => {
  expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
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
    mockBuildKiloCodeExportOutput.mockReset()
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
    completeProductAnalyticsActionMock.mockReset()
    startProductAnalyticsActionMock.mockReset()
    startProductAnalyticsActionMock.mockReturnValue({
      complete: completeProductAnalyticsActionMock,
    })

    mockBuildKiloCodeExportOutput.mockImplementation(
      ({ target, selections }: any) =>
        target === KILO_CODE_EXPORT_TARGETS.KiloV7
          ? {
              filename: "kilo-settings.json",
              copyPayload: { v7: selections[0]?.modelId },
              downloadPayload: { format: "v7", model: selections[0]?.modelId },
              itemCount: 1,
            }
          : {
              filename: "kilo-code-settings.json",
              copyPayload: { legacy: selections[0]?.modelId },
              downloadPayload: {
                format: "legacy",
                model: selections[0]?.modelId,
              },
              itemCount: 1,
            },
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

    const copyButton = await screen.findByRole("button", {
      name: "ui:dialog.kiloCode.actions.copyKiloV7Provider",
    })
    expect(copyButton).toBeEnabled()

    await user.click(copyButton)

    expectApiCredentialProfileActionStarted(
      PRODUCT_ANALYTICS_ACTION_IDS.CopyApiCredentialExportConfig,
    )
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1)
    })
    expect(mockBuildKiloCodeExportOutput).toHaveBeenLastCalledWith(
      expect.objectContaining({
        target: KILO_CODE_EXPORT_TARGETS.KiloV7,
        selections: [
          expect.objectContaining({
            accountId: "profile-1",
            modelId: "a-model",
          }),
        ],
      }),
    )
    expect(writeText).toHaveBeenCalledWith(
      JSON.stringify({ v7: "a-model" }, null, 2),
    )
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "ui:dialog.kiloCode.messages.copiedExportConfig",
    )
    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
        {
          insights: {
            itemCount: 1,
            modelCount: 1,
            selectedCount: 1,
            kiloCodeExportTarget:
              PRODUCT_ANALYTICS_KILO_CODE_EXPORT_TARGETS.KiloV7,
          },
        },
      )
    })
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
        name: "ui:dialog.kiloCode.actions.copyKiloV7Provider",
      }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", {
        name: "ui:dialog.kiloCode.actions.downloadKiloV7Settings",
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
      name: "ui:dialog.kiloCode.actions.copyKiloV7Provider",
    })
    await waitFor(() => expect(copyButton).toBeEnabled())

    await user.click(copyButton)

    expectApiCredentialProfileActionStarted(
      PRODUCT_ANALYTICS_ACTION_IDS.CopyApiCredentialExportConfig,
    )
    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "ui:dialog.kiloCode.messages.copyFailed",
      )
    })
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: {
          itemCount: 1,
          modelCount: 1,
          selectedCount: 1,
          kiloCodeExportTarget:
            PRODUCT_ANALYTICS_KILO_CODE_EXPORT_TARGETS.KiloV7,
        },
      },
    )
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
      name: "ui:dialog.kiloCode.actions.downloadKiloV7Settings",
    })
    await waitFor(() => expect(downloadButton).toBeEnabled())

    const targetSelect = await screen.findByRole("combobox", {
      name: "ui:dialog.kiloCode.labels.exportTarget",
    })
    expect(targetSelect).toHaveTextContent("ui:dialog.kiloCode.targets.kiloV7")
    expectKiloCodeUsageGuidance(KILO_CODE_EXPORT_TARGETS.KiloV7)
    expect(
      screen.queryByText("ui:dialog.kiloCode.help.kiloV7Description"),
    ).not.toBeInTheDocument()

    await user.click(downloadButton)

    expectApiCredentialProfileActionStarted(
      PRODUCT_ANALYTICS_ACTION_IDS.ExportApiCredentialSettingsFile,
    )
    await waitFor(() => {
      expect(mockBuildKiloCodeExportOutput).toHaveBeenCalledWith(
        expect.objectContaining({ target: KILO_CODE_EXPORT_TARGETS.KiloV7 }),
      )
    })
    const link = document.querySelector('a[download="kilo-settings.json"]')
    expect(link).not.toBeInTheDocument()
    expect(createObjectURLSpy.mock.calls[0]?.[0]).toBeInstanceOf(Blob)
    const blobPayload = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ""))
      reader.onerror = () => reject(reader.error)
      reader.readAsText(createObjectURLSpy.mock.calls[0]![0] as Blob)
    })
    expect(blobPayload).toBe(
      JSON.stringify({ format: "v7", model: "gpt-4o-mini" }, null, 2),
    )
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:test")
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "ui:dialog.kiloCode.messages.downloadedSettings",
    )
    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
        {
          insights: {
            itemCount: 1,
            modelCount: 1,
            selectedCount: 1,
            kiloCodeExportTarget:
              PRODUCT_ANALYTICS_KILO_CODE_EXPORT_TARGETS.KiloV7,
          },
        },
      )
    })
  })

  it("switches to legacy output for copy and download without refetching models", async () => {
    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:legacy")
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
    let downloadedFilename = ""
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloadedFilename = this.download
    })
    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["gpt-4o-mini"])

    const { rerender } = render(
      <KiloCodeProfileExportDialog
        isOpen={true}
        onClose={() => {}}
        profile={PROFILE}
      />,
    )

    const targetSelect = await screen.findByRole("combobox", {
      name: "ui:dialog.kiloCode.labels.exportTarget",
    })
    await user.click(targetSelect)
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
    await user.click(
      await screen.findByRole("option", {
        name: "ui:dialog.kiloCode.targets.legacy",
      }),
    )

    await user.click(
      screen.getByRole("button", {
        name: "ui:dialog.kiloCode.actions.copyLegacyApiConfigs",
      }),
    )
    expect(writeText).toHaveBeenCalledWith(
      JSON.stringify({ legacy: "gpt-4o-mini" }, null, 2),
    )
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "ui:dialog.kiloCode.messages.copiedExportConfig",
    )

    await user.click(
      screen.getByRole("button", {
        name: "ui:dialog.kiloCode.actions.downloadLegacySettings",
      }),
    )

    expect(mockBuildKiloCodeExportOutput).toHaveBeenLastCalledWith(
      expect.objectContaining({ target: KILO_CODE_EXPORT_TARGETS.Legacy }),
    )
    expect(downloadedFilename).toBe("kilo-code-settings.json")
    expect(mockFetchOpenAICompatibleModelIds).toHaveBeenCalledTimes(1)
    expectKiloCodeUsageGuidance(KILO_CODE_EXPORT_TARGETS.Legacy)
    expect(
      screen.queryByText("ui:dialog.kiloCode.help.legacyDescription"),
    ).not.toBeInTheDocument()
    expect(completeProductAnalyticsActionMock).toHaveBeenLastCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      {
        insights: expect.objectContaining({
          kiloCodeExportTarget:
            PRODUCT_ANALYTICS_KILO_CODE_EXPORT_TARGETS.Legacy,
        }),
      },
    )

    rerender(
      <KiloCodeProfileExportDialog
        isOpen={false}
        onClose={() => {}}
        profile={PROFILE}
      />,
    )
    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["gpt-4o-mini"])
    rerender(
      <KiloCodeProfileExportDialog
        isOpen={true}
        onClose={() => {}}
        profile={PROFILE}
      />,
    )
    await waitFor(() => {
      expect(mockFetchOpenAICompatibleModelIds).toHaveBeenCalledTimes(2)
    })
    expect(
      screen.getByRole("combobox", {
        name: "ui:dialog.kiloCode.labels.exportTarget",
      }),
    ).toHaveTextContent("ui:dialog.kiloCode.targets.kiloV7")
    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "ui:dialog.kiloCode.actions.downloadKiloV7Settings",
        }),
      ).toBeEnabled()
    })
  })

  it("shows a download-failed toast when building the settings file throws", async () => {
    const user = userEvent.setup()
    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["gpt-4o-mini"])
    mockBuildKiloCodeExportOutput.mockImplementationOnce(() => {
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
      name: "ui:dialog.kiloCode.actions.downloadKiloV7Settings",
    })
    await waitFor(() => expect(downloadButton).toBeEnabled())

    await user.click(downloadButton)

    expectApiCredentialProfileActionStarted(
      PRODUCT_ANALYTICS_ACTION_IDS.ExportApiCredentialSettingsFile,
    )
    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "ui:dialog.kiloCode.messages.downloadFailed",
      )
    })
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: {
          itemCount: 1,
          modelCount: 1,
          selectedCount: 1,
          kiloCodeExportTarget:
            PRODUCT_ANALYTICS_KILO_CODE_EXPORT_TARGETS.KiloV7,
        },
      },
    )
  })
})
