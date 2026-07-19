import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { KILO_CODE_EXPORT_TEST_IDS } from "~/components/kiloCodeExportTestIds"
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
import {
  expectKiloCodeSettingsSizeGuidance,
  expectKiloCodeUsageGuidance,
} from "~~/tests/test-utils/kiloCodeExportGuidance"
import { act, render, screen, waitFor } from "~~/tests/test-utils/render"

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

function renderDialog(profile = PROFILE) {
  return render(
    <KiloCodeProfileExportDialog
      isOpen={true}
      onClose={() => {}}
      profile={profile}
    />,
  )
}

async function chooseExportTarget(
  user: ReturnType<typeof userEvent.setup>,
  target: "kiloV7" | "legacy",
) {
  await user.click(
    screen.getByRole("combobox", {
      name: "ui:dialog.kiloCode.labels.exportTarget",
    }),
  )
  await user.click(
    await screen.findByRole("option", {
      name: `ui:dialog.kiloCode.targets.${target}`,
    }),
  )
}

async function chooseV7Model(
  user: ReturnType<typeof userEvent.setup>,
  modelId: string,
) {
  await user.click(
    screen.getByRole("combobox", {
      name: "ui:dialog.kiloCode.labels.defaultModel",
    }),
  )
  const search = screen.getByTestId(
    KILO_CODE_EXPORT_TEST_IDS.defaultModelSearch,
  )
  await user.clear(search)
  await user.type(search, modelId)
  const exactOption = screen.queryByRole("option", { name: modelId })
  await user.click(
    exactOption ??
      screen.getByRole("option", { name: "ui:searchableSelect.useValue" }),
  )
}

async function chooseLegacyModel(
  user: ReturnType<typeof userEvent.setup>,
  modelId: string,
) {
  await user.click(
    screen.getByRole("combobox", {
      name: "ui:dialog.kiloCode.labels.legacyModelId",
    }),
  )
  const search = screen.getByPlaceholderText(
    "ui:searchableSelect.searchPlaceholder",
  )
  await user.clear(search)
  await user.type(search, modelId)
  await user.click(
    screen.queryByRole("option", { name: modelId }) ??
      screen.getByRole("option", { name: "ui:searchableSelect.useValue" }),
  )
}

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

    mockBuildKiloCodeExportOutput.mockImplementation((options: any) => {
      if (options.target === KILO_CODE_EXPORT_TARGETS.KiloV7) {
        const downloadPayload = {
          format: "v7",
          model: options.defaultModel?.modelId,
        }
        return {
          target: KILO_CODE_EXPORT_TARGETS.KiloV7,
          filename: "kilo-settings.json",
          copyPayload: {
            provider: { "reusable-key": { models: {} } },
            model: options.defaultModel?.modelId,
          },
          downloadPayload,
          downloadJson: JSON.stringify(downloadPayload, null, 2),
          downloadByteLength: 42,
          isDownloadTooLarge: false,
          itemCount: 1,
          modelCount: 7,
        }
      }

      const downloadPayload = {
        format: "legacy",
        model: options.selections[0]?.legacyModelId,
      }
      return {
        target: KILO_CODE_EXPORT_TARGETS.Legacy,
        filename: "kilo-code-settings.json",
        copyPayload: { legacy: options.selections[0]?.legacyModelId },
        downloadPayload,
        downloadJson: JSON.stringify(downloadPayload, null, 2),
        downloadByteLength: 43,
        isDownloadTooLarge: false,
        itemCount: 1,
        modelCount: 3,
      }
    })
  })

  it("passes the full normalized V7 catalog, readable name, and default to the policy", async () => {
    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)
    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce([
      " z-model ",
      "a-model",
      "",
      "a-model",
    ])

    renderDialog()

    const copyButton = await screen.findByRole("button", {
      name: "ui:dialog.kiloCode.actions.copyKiloV7Provider",
    })
    await waitFor(() => expect(copyButton).toBeEnabled())
    expectKiloCodeUsageGuidance(KILO_CODE_EXPORT_TARGETS.KiloV7)
    expect(
      screen.getByRole("combobox", {
        name: "ui:dialog.kiloCode.labels.defaultModel",
      }),
    ).toHaveTextContent("a-model")

    await user.click(copyButton)

    expect(mockFetchOpenAICompatibleModelIds).toHaveBeenCalledWith({
      baseUrl: "https://profile.example.com",
      apiKey: "sk-secret",
    })
    expect(mockBuildKiloCodeExportOutput).toHaveBeenLastCalledWith({
      target: KILO_CODE_EXPORT_TARGETS.KiloV7,
      selections: [
        {
          accountId: "profile-1",
          siteName: "Reusable Key",
          baseUrl: "https://profile.example.com/v1",
          tokenId: 0,
          tokenName: "common:labels.apiKey",
          tokenKey: "sk-secret",
          selectionId: "profile:profile-1",
          providerName: "Reusable Key",
          discoveredModelIds: ["a-model", "z-model"],
          manualModelId: undefined,
        },
      ],
      defaultModel: {
        selectionId: "profile:profile-1",
        modelId: "a-model",
      },
    })
    expect(writeText).toHaveBeenCalledWith(
      JSON.stringify(
        {
          provider: { "reusable-key": { models: {} } },
          model: "a-model",
        },
        null,
        2,
      ),
    )
    expectApiCredentialProfileActionStarted(
      PRODUCT_ANALYTICS_ACTION_IDS.CopyApiCredentialExportConfig,
    )
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      {
        insights: {
          itemCount: 1,
          modelCount: 7,
          selectedCount: 1,
          kiloCodeExportTarget:
            PRODUCT_ANALYTICS_KILO_CODE_EXPORT_TARGETS.KiloV7,
        },
      },
    )
  })

  it("uses target-specific model labels", async () => {
    const user = userEvent.setup()
    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["model-a"])
    renderDialog()

    expect(
      await screen.findByRole("combobox", {
        name: "ui:dialog.kiloCode.labels.defaultModel",
      }),
    ).toBeVisible()

    await chooseExportTarget(user, "legacy")

    expect(
      screen.getByRole("combobox", {
        name: "ui:dialog.kiloCode.labels.legacyModelId",
      }),
    ).toBeVisible()
  })

  it("unions a custom V7 default into the manual model field", async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined)
    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["model-a"])
    renderDialog()

    await screen.findByText("model-a")
    await chooseV7Model(user, "custom/model")
    expect(screen.getAllByText("custom/model")).not.toHaveLength(0)

    await user.click(
      screen.getByRole("button", {
        name: "ui:dialog.kiloCode.actions.copyKiloV7Provider",
      }),
    )

    expect(mockBuildKiloCodeExportOutput).toHaveBeenLastCalledWith(
      expect.objectContaining({
        selections: [
          expect.objectContaining({
            discoveredModelIds: ["model-a"],
            manualModelId: "custom/model",
          }),
        ],
        defaultModel: {
          selectionId: "profile:profile-1",
          modelId: "custom/model",
        },
      }),
    )
  })

  it("keeps the manual catalog entry when a discovered default is selected", async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined)
    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce([
      "model-a",
      "model-b",
    ])
    renderDialog()

    await screen.findByText("model-a")
    await chooseV7Model(user, "manual/model")
    await chooseV7Model(user, "model-b")
    await user.click(
      screen.getByRole("button", {
        name: "ui:dialog.kiloCode.actions.copyKiloV7Provider",
      }),
    )

    expect(screen.getAllByText("manual/model")).not.toHaveLength(0)
    expect(mockBuildKiloCodeExportOutput).toHaveBeenLastCalledWith(
      expect.objectContaining({
        selections: [
          expect.objectContaining({ manualModelId: "manual/model" }),
        ],
        defaultModel: expect.objectContaining({ modelId: "model-b" }),
      }),
    )
  })

  it("preserves a manual model when retry fails", async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined)
    mockFetchOpenAICompatibleModelIds
      .mockRejectedValueOnce(new Error("offline"))
      .mockRejectedValueOnce(new Error("still offline"))
    renderDialog()

    const retry = await screen.findByRole("button", {
      name: "ui:dialog.kiloCode.actions.retryModels",
    })
    await chooseV7Model(user, "manual/model")
    await user.click(retry)
    await screen.findByRole("button", {
      name: "ui:dialog.kiloCode.actions.retryModels",
    })

    expect(
      screen.getByRole("combobox", {
        name: "ui:dialog.kiloCode.labels.defaultModel",
      }),
    ).toHaveTextContent("manual/model")
    expect(screen.getAllByText("manual/model")).not.toHaveLength(0)
  })

  it("preserves a custom Legacy model when retry discovers other models", async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined)
    mockFetchOpenAICompatibleModelIds
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(["discovered-model"])
    renderDialog()

    const retry = await screen.findByRole("button", {
      name: "ui:dialog.kiloCode.actions.retryModels",
    })
    await chooseExportTarget(user, "legacy")
    await chooseLegacyModel(user, "legacy/custom")
    await user.click(retry)

    const legacyModel = screen.getByRole("combobox", {
      name: "ui:dialog.kiloCode.labels.legacyModelId",
    })
    await waitFor(() => expect(legacyModel).toBeEnabled())
    expect(legacyModel).toHaveTextContent("legacy/custom")

    await user.click(
      screen.getByRole("button", {
        name: "ui:dialog.kiloCode.actions.copyLegacyApiConfigs",
      }),
    )
    expect(mockBuildKiloCodeExportOutput).toHaveBeenLastCalledWith(
      expect.objectContaining({
        target: KILO_CODE_EXPORT_TARGETS.Legacy,
        selections: [
          expect.objectContaining({ legacyModelId: "legacy/custom" }),
        ],
      }),
    )
  })

  it("focuses the active model selector after a successful retry", async () => {
    const user = userEvent.setup()
    mockFetchOpenAICompatibleModelIds
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(["model-a"])
    renderDialog()

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.kiloCode.actions.retryModels",
      }),
    )

    const defaultModel = screen.getByRole("combobox", {
      name: "ui:dialog.kiloCode.labels.defaultModel",
    })
    await waitFor(() => expect(defaultModel).toHaveFocus())
  })

  it("focuses the remounted Retry action after a failed retry", async () => {
    const user = userEvent.setup()
    mockFetchOpenAICompatibleModelIds
      .mockRejectedValueOnce(new Error("offline"))
      .mockRejectedValueOnce(new Error("still offline"))
    renderDialog()

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.kiloCode.actions.retryModels",
      }),
    )

    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "ui:dialog.kiloCode.actions.retryModels",
        }),
      ).toHaveFocus(),
    )
  })

  it("returns focus to the V7 selector after removing a manual model", async () => {
    const user = userEvent.setup()
    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["model-a"])
    renderDialog()

    await screen.findByText("model-a")
    await chooseV7Model(user, "manual/model")
    await user.click(
      screen.getByTestId(KILO_CODE_EXPORT_TEST_IDS.removeManualModel),
    )

    await waitFor(() =>
      expect(
        screen.getByRole("combobox", {
          name: "ui:dialog.kiloCode.labels.defaultModel",
        }),
      ).toHaveFocus(),
    )
  })

  it("unions a manual model after successful retry until Remove repairs the default", async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined)
    mockFetchOpenAICompatibleModelIds
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(["model-b", "model-a"])
    renderDialog()

    await screen.findByRole("button", {
      name: "ui:dialog.kiloCode.actions.retryModels",
    })
    await chooseV7Model(user, "manual/model")
    await user.click(
      screen.getByRole("button", {
        name: "ui:dialog.kiloCode.actions.retryModels",
      }),
    )
    await waitFor(() =>
      expect(mockFetchOpenAICompatibleModelIds).toHaveBeenCalledTimes(2),
    )

    await user.click(
      screen.getByRole("button", {
        name: "ui:dialog.kiloCode.actions.copyKiloV7Provider",
      }),
    )
    expect(mockBuildKiloCodeExportOutput).toHaveBeenLastCalledWith(
      expect.objectContaining({
        selections: [
          expect.objectContaining({
            discoveredModelIds: ["model-a", "model-b"],
            manualModelId: "manual/model",
          }),
        ],
        defaultModel: expect.objectContaining({ modelId: "manual/model" }),
      }),
    )

    await user.click(
      screen.getByTestId(KILO_CODE_EXPORT_TEST_IDS.removeManualModel),
    )
    expect(screen.queryByText("manual/model")).not.toBeInTheDocument()
    expect(
      screen.getByRole("combobox", {
        name: "ui:dialog.kiloCode.labels.defaultModel",
      }),
    ).toHaveTextContent("model-a")

    await user.click(
      screen.getByRole("button", {
        name: "ui:dialog.kiloCode.actions.copyKiloV7Provider",
      }),
    )
    expect(mockBuildKiloCodeExportOutput).toHaveBeenLastCalledWith(
      expect.objectContaining({
        selections: [
          expect.not.objectContaining({ manualModelId: expect.anything() }),
        ],
        defaultModel: expect.objectContaining({ modelId: "model-a" }),
      }),
    )
  })

  it("preserves separate V7 and legacy choices while switching without refetching", async () => {
    const user = userEvent.setup()
    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce([
      "model-a",
      "model-b",
    ])
    renderDialog()

    await screen.findByText("model-a")
    await chooseV7Model(user, "manual/v7")
    await chooseExportTarget(user, "legacy")
    expect(screen.queryByText("manual/v7")).not.toBeInTheDocument()
    expect(
      screen.queryByTestId(KILO_CODE_EXPORT_TEST_IDS.removeManualModel),
    ).not.toBeInTheDocument()
    await chooseLegacyModel(user, "legacy/custom")
    await chooseExportTarget(user, "kiloV7")

    expect(
      screen.getByRole("combobox", {
        name: "ui:dialog.kiloCode.labels.defaultModel",
      }),
    ).toHaveTextContent("manual/v7")
    expect(screen.getAllByText("manual/v7")).not.toHaveLength(0)
    expect(
      screen.getByTestId(KILO_CODE_EXPORT_TEST_IDS.removeManualModel),
    ).toBeVisible()

    await chooseExportTarget(user, "legacy")
    expect(
      screen.getByRole("combobox", {
        name: "ui:dialog.kiloCode.labels.legacyModelId",
      }),
    ).toHaveTextContent("legacy/custom")
    expect(mockFetchOpenAICompatibleModelIds).toHaveBeenCalledTimes(1)
    expectKiloCodeUsageGuidance(KILO_CODE_EXPORT_TARGETS.Legacy)
  })

  it("copies and downloads canonical Legacy output with output-derived analytics", async () => {
    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)
    const createObjectURLSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:legacy")
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
    let downloadedFilename = ""
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloadedFilename = this.download
    })
    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["model-a"])
    renderDialog()

    await screen.findByText("model-a")
    await chooseExportTarget(user, "legacy")
    await chooseLegacyModel(user, "legacy/custom")
    await user.click(
      screen.getByRole("button", {
        name: "ui:dialog.kiloCode.actions.copyLegacyApiConfigs",
      }),
    )
    await user.click(
      screen.getByRole("button", {
        name: "ui:dialog.kiloCode.actions.downloadLegacySettings",
      }),
    )

    const expectedPolicyInput = {
      target: KILO_CODE_EXPORT_TARGETS.Legacy,
      selections: [
        {
          accountId: "profile-1",
          siteName: "Reusable Key",
          baseUrl: "https://profile.example.com/v1",
          tokenId: 0,
          tokenName: "common:labels.apiKey",
          tokenKey: "sk-secret",
          legacyModelId: "legacy/custom",
        },
      ],
      currentLegacyProfileName: "Reusable Key - common:labels.apiKey",
    }
    expect(mockBuildKiloCodeExportOutput).toHaveBeenCalledTimes(2)
    expect(mockBuildKiloCodeExportOutput).toHaveBeenNthCalledWith(
      1,
      expectedPolicyInput,
    )
    expect(mockBuildKiloCodeExportOutput).toHaveBeenNthCalledWith(
      2,
      expectedPolicyInput,
    )
    expect(writeText).toHaveBeenCalledWith(
      JSON.stringify({ legacy: "legacy/custom" }, null, 2),
    )
    const blobPayload = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ""))
      reader.onerror = () => reject(reader.error)
      reader.readAsText(createObjectURLSpy.mock.calls[0]![0] as Blob)
    })
    expect(blobPayload).toBe(
      JSON.stringify({ format: "legacy", model: "legacy/custom" }, null, 2),
    )
    expect(downloadedFilename).toBe("kilo-code-settings.json")
    expect(mockFetchOpenAICompatibleModelIds).toHaveBeenCalledTimes(1)
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledTimes(2)
    expect(completeProductAnalyticsActionMock).toHaveBeenLastCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      {
        insights: {
          itemCount: 1,
          modelCount: 3,
          selectedCount: 1,
          kiloCodeExportTarget:
            PRODUCT_ANALYTICS_KILO_CODE_EXPORT_TARGETS.Legacy,
        },
      },
    )
  })

  it("passes all 5,000 discovered models to V7 copy and download policy inputs", async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined)
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:catalog")
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    const discoveredModelIds = Array.from(
      { length: 5_000 },
      (_, index) => `model-${index.toString().padStart(4, "0")}`,
    )
    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(discoveredModelIds)
    renderDialog()

    const copyButton = await screen.findByRole("button", {
      name: "ui:dialog.kiloCode.actions.copyKiloV7Provider",
    })
    await waitFor(() => expect(copyButton).toBeEnabled())
    await user.click(copyButton)
    await user.click(
      screen.getByRole("button", {
        name: "ui:dialog.kiloCode.actions.downloadKiloV7Settings",
      }),
    )

    expect(mockBuildKiloCodeExportOutput).toHaveBeenCalledTimes(2)
    for (const [input] of mockBuildKiloCodeExportOutput.mock.calls) {
      expect(input.selections[0].discoveredModelIds).toHaveLength(5_000)
      expect(input.selections[0].discoveredModelIds).toContain("model-4999")
    }
  })

  it("uses policy downloadJson exactly and revokes the object URL", async () => {
    const user = userEvent.setup()
    const createObjectURLSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:test")
    const revokeObjectURLSpy = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["model-a"])
    mockBuildKiloCodeExportOutput.mockImplementationOnce(() => ({
      target: KILO_CODE_EXPORT_TARGETS.KiloV7,
      filename: "kilo-settings.json",
      copyPayload: { provider: {}, model: "model-a" },
      downloadPayload: { this: "must not be serialized" },
      downloadJson: '{"exact":"policy-json"}',
      downloadByteLength: 23,
      isDownloadTooLarge: false,
      itemCount: 2,
      modelCount: 11,
    }))
    renderDialog()

    const downloadButton = await screen.findByRole("button", {
      name: "ui:dialog.kiloCode.actions.downloadKiloV7Settings",
    })
    await waitFor(() => expect(downloadButton).toBeEnabled())
    await user.click(downloadButton)

    const blobPayload = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ""))
      reader.onerror = () => reject(reader.error)
      reader.readAsText(createObjectURLSpy.mock.calls[0]![0] as Blob)
    })
    expect(blobPayload).toBe('{"exact":"policy-json"}')
    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:test")
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      {
        insights: {
          itemCount: 2,
          modelCount: 11,
          selectedCount: 1,
          kiloCodeExportTarget:
            PRODUCT_ANALYTICS_KILO_CODE_EXPORT_TARGETS.KiloV7,
        },
      },
    )
  })

  it("blocks oversized downloads and keeps copy recovery available", async () => {
    const user = userEvent.setup()
    const createObjectURLSpy = vi.spyOn(URL, "createObjectURL")
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click")
    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["model-a"])
    mockBuildKiloCodeExportOutput.mockImplementationOnce(() => ({
      target: KILO_CODE_EXPORT_TARGETS.KiloV7,
      filename: "kilo-settings.json",
      copyPayload: { provider: {}, model: "model-a" },
      downloadPayload: {},
      downloadJson: "oversized",
      downloadByteLength: 1_048_577,
      isDownloadTooLarge: true,
      itemCount: 1,
      modelCount: 5000,
    }))
    renderDialog()

    const downloadButton = await screen.findByRole("button", {
      name: "ui:dialog.kiloCode.actions.downloadKiloV7Settings",
    })
    await waitFor(() => expect(downloadButton).toBeEnabled())
    await user.click(downloadButton)

    expect(createObjectURLSpy).not.toHaveBeenCalled()
    expect(clickSpy).not.toHaveBeenCalled()
    expectKiloCodeSettingsSizeGuidance("single")
    expect(
      screen.getByRole("button", {
        name: "ui:dialog.kiloCode.actions.copyKiloV7Provider",
      }),
    ).toBeEnabled()
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
        insights: {
          itemCount: 1,
          modelCount: 5000,
          selectedCount: 1,
          kiloCodeExportTarget:
            PRODUCT_ANALYTICS_KILO_CODE_EXPORT_TARGETS.KiloV7,
        },
      },
    )
  })

  it.each([
    {
      label: "malformed URL",
      profile: { ...PROFILE, baseUrl: "not-a-valid-url" },
    },
    {
      label: "blank API key",
      profile: { ...PROFILE, apiKey: "" },
    },
  ])(
    "contains an invalid profile instead of crashing for $label",
    async ({ profile }) => {
      const user = userEvent.setup()

      renderDialog(profile)

      expect(await screen.findByRole("dialog")).toBeVisible()
      expect(
        await screen.findByText("ui:dialog.kiloCode.messages.invalidProfile"),
      ).toBeVisible()
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
      await chooseExportTarget(user, "legacy")
      expect(
        screen.getByText("ui:dialog.kiloCode.messages.invalidProfile"),
      ).toBeVisible()
      expect(
        screen.getByRole("button", {
          name: "ui:dialog.kiloCode.actions.copyLegacyApiConfigs",
        }),
      ).toBeDisabled()
      expect(
        screen.getByRole("button", {
          name: "ui:dialog.kiloCode.actions.downloadLegacySettings",
        }),
      ).toBeDisabled()
      expect(mockBuildKiloCodeExportOutput).not.toHaveBeenCalled()
      expect(mockFetchOpenAICompatibleModelIds).not.toHaveBeenCalled()
    },
  )

  it.each([
    { label: "empty", fails: false },
    { label: "error", fails: true },
  ])(
    "offers retry and manual recovery for $label discovery",
    async ({ fails }) => {
      const user = userEvent.setup()
      if (fails) {
        mockFetchOpenAICompatibleModelIds.mockRejectedValueOnce(
          new Error("offline"),
        )
      } else {
        mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce([" ", ""])
      }
      renderDialog()

      expect(
        await screen.findByRole("button", {
          name: "ui:dialog.kiloCode.actions.retryModels",
        }),
      ).toBeVisible()
      const defaultModel = screen.getByRole("combobox", {
        name: "ui:dialog.kiloCode.labels.defaultModel",
      })
      expect(defaultModel).toBeEnabled()

      await chooseV7Model(user, "manual/recovery")
      expect(
        screen.getByRole("button", {
          name: "ui:dialog.kiloCode.actions.copyKiloV7Provider",
        }),
      ).toBeEnabled()
    },
  )

  it("ignores a stale model response after profile credentials change", async () => {
    let resolveStale: (models: string[]) => void = () => {}
    const stale = new Promise<string[]>((resolve) => {
      resolveStale = resolve
    })
    mockFetchOpenAICompatibleModelIds
      .mockReturnValueOnce(stale)
      .mockResolvedValueOnce(["new-model"])
    const { rerender } = renderDialog()
    await waitFor(() =>
      expect(mockFetchOpenAICompatibleModelIds).toHaveBeenCalledTimes(1),
    )

    const nextProfile = {
      ...PROFILE,
      id: "profile-2",
      name: "New Profile",
      baseUrl: "https://new-profile.example.com/v1",
      apiKey: "sk-new",
    }
    rerender(
      <KiloCodeProfileExportDialog
        isOpen={true}
        onClose={() => {}}
        profile={nextProfile}
      />,
    )

    await waitFor(() =>
      expect(mockFetchOpenAICompatibleModelIds).toHaveBeenCalledTimes(2),
    )
    expect(await screen.findByText("new-model")).toBeVisible()
    resolveStale(["stale-model"])
    await waitFor(() =>
      expect(screen.queryByText("stale-model")).not.toBeInTheDocument(),
    )
    expect(
      screen.getByRole("combobox", {
        name: "ui:dialog.kiloCode.labels.defaultModel",
      }),
    ).toHaveTextContent("new-model")
  })

  it("does not move focus during initial or changed-profile discovery", async () => {
    let resolveInitial: (models: string[]) => void = () => {}
    let resolveChanged: (models: string[]) => void = () => {}
    const initialRequest = new Promise<string[]>((resolve) => {
      resolveInitial = resolve
    })
    const changedRequest = new Promise<string[]>((resolve) => {
      resolveChanged = resolve
    })
    mockFetchOpenAICompatibleModelIds
      .mockReturnValueOnce(initialRequest)
      .mockReturnValueOnce(changedRequest)
    const { rerender } = renderDialog()
    await waitFor(() =>
      expect(mockFetchOpenAICompatibleModelIds).toHaveBeenCalledTimes(1),
    )
    const exportTarget = screen.getByRole("combobox", {
      name: "ui:dialog.kiloCode.labels.exportTarget",
    })
    exportTarget.focus()

    await act(async () => {
      resolveInitial(["initial-model"])
      await initialRequest
    })
    expect(exportTarget).toHaveFocus()

    rerender(
      <KiloCodeProfileExportDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          ...PROFILE,
          id: "profile-2",
          baseUrl: "https://changed.example.com/v1",
          apiKey: "sk-changed",
        }}
      />,
    )
    await waitFor(() =>
      expect(mockFetchOpenAICompatibleModelIds).toHaveBeenCalledTimes(2),
    )
    expect(exportTarget).toHaveFocus()

    await act(async () => {
      resolveChanged(["changed-model"])
      await changedRequest
    })
    expect(exportTarget).toHaveFocus()
  })

  it("ignores an in-flight response from before close after reopening", async () => {
    let resolveStale: (models: string[]) => void = () => {}
    let resolveCurrent: (models: string[]) => void = () => {}
    const staleRequest = new Promise<string[]>((resolve) => {
      resolveStale = resolve
    })
    const currentRequest = new Promise<string[]>((resolve) => {
      resolveCurrent = resolve
    })
    mockFetchOpenAICompatibleModelIds
      .mockReturnValueOnce(staleRequest)
      .mockReturnValueOnce(currentRequest)
    const { rerender } = renderDialog()
    await waitFor(() =>
      expect(mockFetchOpenAICompatibleModelIds).toHaveBeenCalledTimes(1),
    )

    rerender(
      <KiloCodeProfileExportDialog
        isOpen={false}
        onClose={() => {}}
        profile={PROFILE}
      />,
    )
    rerender(
      <KiloCodeProfileExportDialog
        isOpen={true}
        onClose={() => {}}
        profile={PROFILE}
      />,
    )
    await waitFor(() =>
      expect(mockFetchOpenAICompatibleModelIds).toHaveBeenCalledTimes(2),
    )

    await act(async () => {
      resolveStale(["stale-model"])
      await staleRequest
    })
    expect(screen.queryByText("stale-model")).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "ui:dialog.kiloCode.actions.copyKiloV7Provider",
      }),
    ).toBeDisabled()
    expect(
      screen.getByRole("combobox", {
        name: "ui:dialog.kiloCode.labels.defaultModel",
      }),
    ).toHaveTextContent("common:status.loading")

    await act(async () => {
      resolveCurrent(["current-model"])
      await currentRequest
    })
    expect(await screen.findByText("current-model")).toBeVisible()
  })

  it("resets target-local state before loading changed profile credentials", async () => {
    const user = userEvent.setup()
    let resolveNextProfile: (models: string[]) => void = () => {}
    const nextProfileRequest = new Promise<string[]>((resolve) => {
      resolveNextProfile = resolve
    })
    mockFetchOpenAICompatibleModelIds
      .mockResolvedValueOnce(["model-a"])
      .mockReturnValueOnce(nextProfileRequest)
    const { rerender } = renderDialog()

    await screen.findByText("model-a")
    await chooseV7Model(user, "manual/v7")
    await chooseExportTarget(user, "legacy")
    await chooseLegacyModel(user, "legacy/custom")

    const nextProfile = {
      ...PROFILE,
      id: "profile-2",
      name: "Next Profile",
      baseUrl: "https://next-profile.example.com/v1",
      apiKey: "sk-next",
    }
    rerender(
      <KiloCodeProfileExportDialog
        isOpen={true}
        onClose={() => {}}
        profile={nextProfile}
      />,
    )
    await waitFor(() =>
      expect(mockFetchOpenAICompatibleModelIds).toHaveBeenCalledTimes(2),
    )

    expect(
      screen.getByRole("combobox", {
        name: "ui:dialog.kiloCode.labels.exportTarget",
      }),
    ).toHaveTextContent("ui:dialog.kiloCode.targets.kiloV7")
    expect(screen.queryByText("manual/v7")).not.toBeInTheDocument()
    expect(screen.queryByText("legacy/custom")).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "ui:dialog.kiloCode.actions.copyKiloV7Provider",
      }),
    ).toBeDisabled()

    await act(async () => {
      resolveNextProfile(["next-model"])
      await nextProfileRequest
    })
    expect(await screen.findByText("next-model")).toBeVisible()

    await chooseExportTarget(user, "legacy")
    const legacyModel = screen.getByRole("combobox", {
      name: "ui:dialog.kiloCode.labels.legacyModelId",
    })
    expect(legacyModel).toHaveTextContent("next-model")
    expect(legacyModel).not.toHaveTextContent("legacy/custom")
  })

  it("resets target-local values and refetches when the dialog reopens", async () => {
    const user = userEvent.setup()
    mockFetchOpenAICompatibleModelIds
      .mockResolvedValueOnce(["model-a"])
      .mockResolvedValueOnce(["model-b"])
    const { rerender } = renderDialog()

    await screen.findByText("model-a")
    await chooseV7Model(user, "manual/model")
    await chooseExportTarget(user, "legacy")
    rerender(
      <KiloCodeProfileExportDialog
        isOpen={false}
        onClose={() => {}}
        profile={PROFILE}
      />,
    )
    rerender(
      <KiloCodeProfileExportDialog
        isOpen={true}
        onClose={() => {}}
        profile={PROFILE}
      />,
    )

    await waitFor(() =>
      expect(mockFetchOpenAICompatibleModelIds).toHaveBeenCalledTimes(2),
    )
    expect(
      screen.getByRole("combobox", {
        name: "ui:dialog.kiloCode.labels.exportTarget",
      }),
    ).toHaveTextContent("ui:dialog.kiloCode.targets.kiloV7")
    expect(
      screen.getByRole("combobox", {
        name: "ui:dialog.kiloCode.labels.defaultModel",
      }),
    ).toHaveTextContent("model-b")
    expect(screen.queryByText("manual/model")).not.toBeInTheDocument()
  })

  it("keeps copy failure semantics when clipboard export fails", async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(
      new Error("clipboard blocked"),
    )
    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["model-a"])
    renderDialog()

    const copyButton = await screen.findByRole("button", {
      name: "ui:dialog.kiloCode.actions.copyKiloV7Provider",
    })
    await waitFor(() => expect(copyButton).toBeEnabled())
    await user.click(copyButton)

    expect(toastErrorMock).toHaveBeenCalledWith(
      "ui:dialog.kiloCode.messages.copyFailed",
    )
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      expect.objectContaining({
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      }),
    )
  })

  it("keeps build failure semantics for settings downloads", async () => {
    const user = userEvent.setup()
    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["model-a"])
    mockBuildKiloCodeExportOutput.mockImplementationOnce(() => {
      throw new Error("build failed")
    })
    renderDialog()

    const downloadButton = await screen.findByRole("button", {
      name: "ui:dialog.kiloCode.actions.downloadKiloV7Settings",
    })
    await waitFor(() => expect(downloadButton).toBeEnabled())
    await user.click(downloadButton)

    expectApiCredentialProfileActionStarted(
      PRODUCT_ANALYTICS_ACTION_IDS.ExportApiCredentialSettingsFile,
    )
    expect(toastErrorMock).toHaveBeenCalledWith(
      "ui:dialog.kiloCode.messages.downloadFailed",
    )
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      expect.objectContaining({
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      }),
    )
  })
})
