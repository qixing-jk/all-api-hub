import { renderHook } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { useState } from "react"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  API_CREDENTIAL_PROFILES_TEST_IDS,
  getApiCredentialProfileVerifyProbeTestId,
} from "~/features/ApiCredentialProfiles/testIds"
import {
  useProfileVerification,
  type VerifyApiCredentialProfileDialogProps,
} from "~/features/ApiCredentialProfiles/verification/useProfileVerification"
import { VerifyApiCredentialProfileDialog } from "~/features/ApiCredentialProfiles/verification/VerifyApiCredentialProfileDialog"
import { modelMetadataService } from "~/services/models/modelMetadata"
import { MODEL_METADATA_URL } from "~/services/models/modelMetadata/constants"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import type { ApiVerificationProbeResult } from "~/services/verification/aiApiVerification"
import {
  API_TYPES,
  API_VERIFICATION_PROBE_STATUSES,
} from "~/services/verification/aiApiVerification"
import { API_VERIFICATION_REQUEST_PROFILES } from "~/services/verification/aiApiVerification/types"
import {
  createProfileModelVerificationHistoryTarget,
  createProfileVerificationHistoryTarget,
  createVerificationHistorySummary,
  verificationResultHistoryStorage,
} from "~/services/verification/verificationResultHistory"
import { server } from "~~/tests/msw/server"
import { requireHistoryTarget } from "~~/tests/test-utils/history"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "~~/tests/test-utils/render"
import { stubVerificationOwnerStoresUnavailable } from "~~/tests/test-utils/verificationOwnerStores"

const {
  loggerErrorMock,
  mockProbeDefinitions,
  mockRunApiVerificationProbe,
  mockStartProductAnalyticsAction,
  mockCompleteProductAnalyticsAction,
} = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
  mockProbeDefinitions: vi.fn(),
  mockRunApiVerificationProbe: vi.fn(),
  mockStartProductAnalyticsAction: vi.fn(),
  mockCompleteProductAnalyticsAction: vi.fn(),
}))

/**
 * Small promise helper for coordinating async storage behavior in tests.
 */
function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return {
    promise,
    resolve,
    reject,
  }
}

async function selectApiTypeOption(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(getApiTypeSelect(), API_TYPES.ANTHROPIC)
}

function getApiTypeSelect() {
  return screen.getByRole("combobox", {
    name: "aiApiVerification:verifyDialog.meta.apiType",
  })
}

async function selectOpenAICompatibleApiTypeOption(
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.selectOptions(getApiTypeSelect(), API_TYPES.OPENAI_COMPATIBLE)
}

vi.mock("~/services/verification/aiApiVerification", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("~/services/verification/aiApiVerification")
    >()
  return {
    ...original,
    getProbesForModality: (
      modality: Parameters<typeof original.getProbesForModality>[0],
      apiType: Parameters<typeof original.getProbesForModality>[1],
    ) =>
      (modality === undefined ||
      modality === original.MODEL_TEST_MODALITIES.Text
        ? mockProbeDefinitions(apiType)
        : undefined) ?? original.getProbesForModality(modality, apiType),
    runApiVerificationProbe: (...args: unknown[]) =>
      mockRunApiVerificationProbe(...args),
  }
})

vi.mock("~/services/productAnalytics/actions", () => ({
  resolveProductAnalyticsErrorCategoryFromError: (error: unknown) =>
    error &&
    typeof error === "object" &&
    (error as { statusCode?: unknown }).statusCode === 401
      ? PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth
      : PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
  startProductAnalyticsAction: (...args: unknown[]) =>
    mockStartProductAnalyticsAction(...args),
}))

const mockFetchOpenAICompatibleModelIds = vi.fn()
const mockFetchAnthropicModelIds = vi.fn()
const mockFetchGoogleModelIds = vi.fn()

vi.mock("~/services/aiApi/openaiCompatible", () => ({
  fetchOpenAICompatibleModelIds: (...args: unknown[]) =>
    mockFetchOpenAICompatibleModelIds(...args),
}))

vi.mock("~/services/aiApi/anthropic", () => ({
  fetchAnthropicModelIds: (...args: unknown[]) =>
    mockFetchAnthropicModelIds(...args),
}))

vi.mock("~/services/aiApi/google", () => ({
  fetchGoogleModelIds: (...args: unknown[]) => mockFetchGoogleModelIds(...args),
}))

const { mockRunPelicanTest } = vi.hoisted(() => ({
  mockRunPelicanTest: vi.fn(),
}))

vi.mock("~/services/verification/modelQuality/pelican", () => ({
  PELICAN_TEST_PROMPT: "pelican",
  runPelicanTest: (...args: unknown[]) => mockRunPelicanTest(...args),
}))

vi.mock("~/utils/core/logger", async (importOriginal) => {
  const original = await importOriginal<typeof import("~/utils/core/logger")>()

  return {
    ...original,
    createLogger: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: (...args: unknown[]) => loggerErrorMock(...args),
    }),
  }
})

vi.mock("~/components/ui", async (importOriginal) => {
  const original = await importOriginal<typeof import("~/components/ui")>()

  return {
    ...original,
    SearchableSelect: ({
      "aria-label": ariaLabel,
      "data-testid": testId,
      disabled,
      onChange,
      options,
      placeholder,
      value,
    }: {
      "aria-label"?: string
      "data-testid"?: string
      disabled?: boolean
      onChange: (value: string) => void
      options: Array<{ value: string; label: string }>
      placeholder?: string
      value: string
    }) => {
      const [isOpen, setIsOpen] = useState(false)
      const selectedOption = options.find((option) => option.value === value)
      if (ariaLabel === "aiApiVerification:verifyDialog.meta.apiType") {
        return (
          <select
            aria-label={ariaLabel}
            data-testid={testId}
            disabled={disabled}
            value={value}
            onChange={(event) => onChange(event.currentTarget.value)}
          >
            {placeholder && !value ? (
              <option value="">{placeholder}</option>
            ) : null}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )
      }

      return (
        <div>
          <button
            aria-label={ariaLabel}
            data-testid={testId}
            disabled={disabled}
            type="button"
            role="combobox"
            aria-expanded={isOpen}
            onClick={() => setIsOpen((current) => !current)}
          >
            {selectedOption?.label || value || placeholder}
          </button>
          {isOpen ? (
            <div role="listbox">
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  onClick={() => {
                    onChange(option.value)
                    setIsOpen(false)
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      )
    },
  }
})

describe("VerifyApiCredentialProfileDialog", () => {
  beforeEach(async () => {
    vi.restoreAllMocks()
    // This suite passes profiles in as props instead of persisting them, so the
    // orphan sweep must not read the empty owner stores as "every owner is gone".
    stubVerificationOwnerStoresUnavailable()
    loggerErrorMock.mockReset()
    mockProbeDefinitions.mockReset()
    mockRunApiVerificationProbe.mockReset()
    mockStartProductAnalyticsAction.mockReset()
    mockCompleteProductAnalyticsAction.mockReset()
    mockStartProductAnalyticsAction.mockReturnValue({
      complete: mockCompleteProductAnalyticsAction,
    })
    mockFetchOpenAICompatibleModelIds.mockReset()
    mockFetchAnthropicModelIds.mockReset()
    mockFetchGoogleModelIds.mockReset()
    mockRunPelicanTest.mockReset()
    mockFetchOpenAICompatibleModelIds.mockResolvedValue([])
    mockFetchAnthropicModelIds.mockResolvedValue([])
    mockFetchGoogleModelIds.mockResolvedValue([])
    await verificationResultHistoryStorage.clearAllData()
  })

  const sessionProfile = {
    id: "session-a",
    name: "Session A",
    apiType: API_TYPES.OPENAI_COMPATIBLE,
    baseUrl: "https://example.invalid",
    apiKey: "synthetic-key",
    tagIds: [],
    notes: "",
    createdAt: 1,
    updatedAt: 1,
  }
  const sessionProps: VerifyApiCredentialProfileDialogProps = {
    isOpen: true,
    profile: sessionProfile,
    onClose: vi.fn(),
    initialModelId: "model",
  }
  const acceptedProbe: ApiVerificationProbeResult = {
    id: "text-generation",
    status: "pass",
    latencyMs: 1,
    summary: "Accepted",
  }

  it("locks enhanced simulation and identity during an active probe", async () => {
    const pending = createDeferred<ApiVerificationProbeResult>()
    mockRunApiVerificationProbe.mockReturnValue(pending.promise)
    const { result } = renderHook(useProfileVerification, {
      initialProps: sessionProps,
    })
    await waitFor(() => expect(result.current.isFetchingModels).toBe(false))
    act(() => result.current.setRequestProfileEnhanced(true))
    expect(result.current.requestProfileEnhanced).toBe(false)
    act(() =>
      result.current.setRequestProfile(API_VERIFICATION_REQUEST_PROFILES.Codex),
    )
    act(() => result.current.setModelId("model"))
    let running!: Promise<void>
    act(() => {
      running = result.current.runSingleProbe("text-generation")
    })
    await waitFor(() => expect(result.current.canClose).toBe(false))
    act(() => {
      result.current.setRequestProfileEnhanced(true)
      result.current.setRequestProfile(API_VERIFICATION_REQUEST_PROFILES.Claude)
    })
    expect(result.current.requestProfileEnhanced).toBe(false)
    expect(result.current.requestProfile).toBe(
      API_VERIFICATION_REQUEST_PROFILES.Codex,
    )
    await act(async () => {
      pending.resolve(acceptedProbe)
      await running
    })
  })

  it("refreshes model discovery when client simulation changes the protocol", async () => {
    mockFetchOpenAICompatibleModelIds.mockResolvedValue(["openai-model"])
    mockFetchAnthropicModelIds.mockResolvedValue(["claude-model"])
    const { result } = renderHook(useProfileVerification, {
      initialProps: sessionProps,
    })
    await waitFor(() =>
      expect(result.current.modelOptions).toEqual(["openai-model"]),
    )
    act(() =>
      result.current.setRequestProfile(
        API_VERIFICATION_REQUEST_PROFILES.Claude,
      ),
    )
    expect(result.current.modelId).toBe("")
    expect(result.current.modelOptions).toEqual([])
    await waitFor(() =>
      expect(result.current.modelOptions).toEqual(["claude-model"]),
    )
    expect(result.current.modelId).toBe("claude-model")
    act(() =>
      result.current.setRequestProfile(
        API_VERIFICATION_REQUEST_PROFILES.Default,
      ),
    )
    expect(result.current.modelId).toBe("claude-model")
    expect(mockFetchAnthropicModelIds).toHaveBeenCalledTimes(1)
  })

  it("keeps ordinary requests as default and lets a text test select a CLI request profile", async () => {
    const user = userEvent.setup()
    mockFetchOpenAICompatibleModelIds.mockResolvedValue(["model"])
    mockProbeDefinitions.mockReturnValue([
      { id: "text-generation", requiresModelId: true },
    ])
    mockRunApiVerificationProbe.mockResolvedValue({
      ...acceptedProbe,
      status: "unsupported",
      summary: "Untranslated fallback",
      summaryKey: "verifyDialog.summaries.requestProfileIncompatible",
      requestProfile: API_VERIFICATION_REQUEST_PROFILES.Codex,
    })
    render(<VerifyApiCredentialProfileDialog {...sessionProps} />)
    const selector = await screen.findByRole("combobox", {
      name: /requestProfile/,
    })
    expect(selector).toHaveTextContent(/default/)
    await user.click(selector)
    await user.click(screen.getByRole("option", { name: /codex/ }))
    expect(getApiTypeSelect()).toHaveValue(API_TYPES.OPENAI)
    const probe = screen.getByTestId(
      getApiCredentialProfileVerifyProbeTestId("text-generation"),
    )
    await user.click(
      within(probe).getByTestId(
        API_CREDENTIAL_PROFILES_TEST_IDS.verifyProbeRunButton,
      ),
    )
    await waitFor(() =>
      expect(mockRunApiVerificationProbe).toHaveBeenCalledWith(
        expect.objectContaining({
          requestProfile: API_VERIFICATION_REQUEST_PROFILES.Codex,
          apiType: "openai",
          probeId: "text-generation",
        }),
      ),
    )
    await waitFor(() =>
      expect(probe).toHaveTextContent(
        "aiApiVerification:verifyDialog.summaries.requestProfileIncompatible",
      ),
    )
    await user.selectOptions(getApiTypeSelect(), API_TYPES.ANTHROPIC)
    expect(selector).toHaveTextContent(/default/)
  })

  it("keeps enhanced simulation opt-in and resets it when returning to ordinary requests", async () => {
    const user = userEvent.setup()
    mockFetchAnthropicModelIds.mockResolvedValue(["model"])
    mockProbeDefinitions.mockReturnValue([
      { id: "text-generation", requiresModelId: true },
    ])
    mockRunApiVerificationProbe.mockResolvedValue(acceptedProbe)
    render(<VerifyApiCredentialProfileDialog {...sessionProps} />)
    expect(
      screen.queryByRole("switch", { name: /enhancedLabel/ }),
    ).not.toBeInTheDocument()
    const selector = await screen.findByRole("combobox", {
      name: /requestProfile/,
    })
    await user.click(selector)
    await user.click(screen.getByRole("option", { name: /claude/ }))
    const enhanced = screen.getByRole("switch", { name: /enhancedLabel/ })
    expect(enhanced).not.toBeChecked()
    await user.click(enhanced)
    const probe = screen.getByTestId(
      getApiCredentialProfileVerifyProbeTestId("text-generation"),
    )
    await user.click(
      within(probe).getByTestId(
        API_CREDENTIAL_PROFILES_TEST_IDS.verifyProbeRunButton,
      ),
    )
    await waitFor(() =>
      expect(mockRunApiVerificationProbe).toHaveBeenCalledWith(
        expect.objectContaining({
          requestProfile: API_VERIFICATION_REQUEST_PROFILES.Claude,
          requestProfileEnhanced: true,
        }),
      ),
    )
    await waitFor(() => expect(enhanced).toBeEnabled())
    await user.click(selector)
    await user.click(screen.getByRole("option", { name: /default/ }))
    expect(
      screen.queryByRole("switch", { name: /enhancedLabel/ }),
    ).not.toBeInTheDocument()
    await user.click(selector)
    await user.click(screen.getByRole("option", { name: /claude/ }))
    expect(
      screen.getByRole("switch", { name: /enhancedLabel/ }),
    ).not.toBeChecked()
  })

  it("keeps the selected model when switching to a different modality", async () => {
    const { result } = renderHook(useProfileVerification, {
      initialProps: sessionProps,
    })
    await waitFor(() => expect(result.current.isFetchingModels).toBe(false))

    act(() => result.current.setModelId("text-embedding-3-small"))

    await waitFor(() =>
      expect(result.current.modelId).toBe("text-embedding-3-small"),
    )
    expect(result.current.probes.map((probe) => probe.definition.id)).toEqual([
      "models",
      "embedding",
    ])
    expect(mockFetchOpenAICompatibleModelIds).toHaveBeenCalledTimes(1)
  })

  it("keeps the user's selected model when remote capability metadata arrives", async () => {
    await modelMetadataService.initialize()
    modelMetadataService.clearCache()
    const response = createDeferred<Response>()
    server.use(http.get(MODEL_METADATA_URL, () => response.promise))
    const { result, unmount } = renderHook(useProfileVerification, {
      initialProps: { ...sessionProps, initialModelId: "initial-deployment" },
    })
    try {
      await waitFor(() => expect(result.current.isFetchingModels).toBe(false))
      act(() => result.current.setModelId("user-choice"))
      await act(async () =>
        response.resolve(
          HttpResponse.json({
            models: [
              {
                id: "initial-deployment",
                name: "Initial",
                provider_id: "test",
                modalities: { input: ["text"], output: ["image"] },
              },
              {
                id: "user-choice",
                name: "Choice",
                provider_id: "test",
                modalities: { input: ["text"], output: ["video"] },
              },
            ],
          }),
        ),
      )
      await waitFor(() => expect(result.current.modelModality).toBe("video"))
      expect(result.current.modelId).toBe("user-choice")
      expect(mockFetchOpenAICompatibleModelIds).toHaveBeenCalledTimes(1)
    } finally {
      unmount()
      modelMetadataService.clearCache()
    }
  })

  it("defers remote capability updates until an active probe finishes", async () => {
    await modelMetadataService.initialize()
    modelMetadataService.clearCache()
    const response = createDeferred<Response>()
    const probe = createDeferred<ApiVerificationProbeResult>()
    server.use(http.get(MODEL_METADATA_URL, () => response.promise))
    mockRunApiVerificationProbe.mockReturnValueOnce(probe.promise)
    const { result, unmount } = renderHook(useProfileVerification, {
      initialProps: { ...sessionProps, initialModelId: "deferred-deployment" },
    })
    try {
      await waitFor(() => expect(result.current.isFetchingModels).toBe(false))
      act(() => {
        void result.current.runSingleProbe("text-generation")
      })
      await waitFor(() => expect(result.current.isAnyProbeRunning).toBe(true))
      await act(async () => {
        response.resolve(
          HttpResponse.json({
            models: [
              {
                id: "deferred-deployment",
                name: "Deferred",
                provider_id: "test",
                modalities: { input: ["text"], output: ["image"] },
              },
            ],
          }),
        )
        await modelMetadataService.initialize()
      })
      expect(result.current.isAnyProbeRunning).toBe(true)
      expect(result.current.modelModality).toBe("text")
      await act(async () => probe.resolve(acceptedProbe))
      await waitFor(() => expect(result.current.modelModality).toBe("image"))
      expect(mockRunApiVerificationProbe).toHaveBeenCalledTimes(1)
    } finally {
      unmount()
      modelMetadataService.clearCache()
    }
  })

  it("uses endpoint facts only for the model they describe", async () => {
    const { result } = renderHook(useProfileVerification, {
      initialProps: {
        ...sessionProps,
        initialModelId: "custom-vector-model",
        initialSupportedEndpointTypes: ["/v1/embeddings"],
      },
    })
    await waitFor(() => expect(result.current.isFetchingModels).toBe(false))
    expect(result.current.modelModality).toBe("embedding")

    act(() => result.current.setModelId("bge-reranker-v2-m3"))

    await waitFor(() => expect(result.current.modelModality).toBe("rerank"))
    expect(result.current.modelId).toBe("bge-reranker-v2-m3")
    expect(result.current.probes.map((probe) => probe.definition.id)).toEqual([
      "models",
      "rerank",
    ])
  })

  it.each([
    { transition: "target", outcome: "response" },
    { transition: "target", outcome: "rejection" },
    { transition: "reopen", outcome: "response" },
    { transition: "reopen", outcome: "rejection" },
  ])(
    "ignores an obsolete $outcome after $transition without clearing the new active probe",
    async ({ transition, outcome }) => {
      const older = createDeferred<ApiVerificationProbeResult>()
      const newer = createDeferred<ApiVerificationProbeResult>()
      mockRunApiVerificationProbe
        .mockReturnValueOnce(older.promise)
        .mockReturnValueOnce(newer.promise)
      const { result, rerender } = renderHook(useProfileVerification, {
        initialProps: sessionProps,
      })
      await waitFor(() => expect(result.current.isFetchingModels).toBe(false))
      let oldRun!: Promise<void>
      let newRun!: Promise<void>
      act(() => {
        oldRun = result.current.runSingleProbe("text-generation")
      })
      const nextProps =
        transition === "target"
          ? { ...sessionProps, profile: { ...sessionProfile, id: "session-b" } }
          : sessionProps
      if (transition === "reopen") rerender({ ...sessionProps, isOpen: false })
      rerender(nextProps)
      await waitFor(() => expect(result.current.isFetchingModels).toBe(false))
      act(() => {
        newRun = result.current.runSingleProbe("text-generation")
      })
      await act(async () => {
        if (outcome === "response") older.resolve(acceptedProbe)
        else older.reject(new DOMException("Aborted", "AbortError"))
        await oldRun
      })
      expect(result.current.activeProbeId).toBe("text-generation")
      expect(
        result.current.probes.find(
          (probe) => probe.definition.id === "text-generation",
        ),
      ).toMatchObject({ isRunning: true, result: null })
      expect(
        await verificationResultHistoryStorage.getLatestSummary(
          requireHistoryTarget(
            createProfileModelVerificationHistoryTarget("session-a", "model"),
          ),
        ),
      ).toBeNull()
      await act(async () => {
        newer.resolve(acceptedProbe)
        await newRun
      })
      expect(result.current.activeProbeId).toBeNull()
    },
  )

  it("keeps a new target busy while an old target's committed history save finishes", async () => {
    const firstSave = createDeferred<void>()
    const secondSave = createDeferred<void>()
    const originalSave =
      verificationResultHistoryStorage.upsertLatestSummary.bind(
        verificationResultHistoryStorage,
      )
    vi.spyOn(verificationResultHistoryStorage, "upsertLatestSummary")
      .mockImplementationOnce(async (summary) => {
        await firstSave.promise
        return originalSave(summary)
      })
      .mockImplementationOnce(async (summary) => {
        await secondSave.promise
        return originalSave(summary)
      })
    mockRunApiVerificationProbe.mockResolvedValue(acceptedProbe)
    const { result, rerender } = renderHook(useProfileVerification, {
      initialProps: sessionProps,
    })
    await waitFor(() => expect(result.current.isFetchingModels).toBe(false))
    let oldRun!: Promise<void>
    let newRun!: Promise<void>
    act(() => {
      oldRun = result.current.runSingleProbe("text-generation")
    })
    await waitFor(() => expect(result.current.isPersisting).toBe(true))
    rerender({
      ...sessionProps,
      profile: { ...sessionProfile, id: "session-b" },
    })
    await waitFor(() => expect(result.current.isFetchingModels).toBe(false))
    act(() => {
      newRun = result.current.runSingleProbe("text-generation")
    })
    await waitFor(() =>
      expect(
        verificationResultHistoryStorage.upsertLatestSummary,
      ).toHaveBeenCalledTimes(2),
    )
    await act(async () => {
      firstSave.resolve()
      await oldRun
    })
    expect(result.current.isPersisting).toBe(true)
    expect(result.current.activeProbeId).toBe("text-generation")
    expect(result.current.persistedSummary).toBeNull()
    expect(
      await verificationResultHistoryStorage.getLatestSummary(
        requireHistoryTarget(
          createProfileModelVerificationHistoryTarget("session-a", "model"),
        ),
      ),
    ).not.toBeNull()
    await act(async () => {
      secondSave.resolve()
      await newRun
    })
    expect(result.current.isPersisting).toBe(false)
  })

  it("does not clear a new target's running rows when an old clear request finishes", async () => {
    const clearing = createDeferred<boolean>()
    const probe = createDeferred<ApiVerificationProbeResult>()
    vi.spyOn(
      verificationResultHistoryStorage,
      "clearTarget",
    ).mockImplementationOnce(() => clearing.promise)
    mockRunApiVerificationProbe.mockReturnValueOnce(probe.promise)
    const { result, rerender } = renderHook(useProfileVerification, {
      initialProps: sessionProps,
    })
    await waitFor(() => expect(result.current.isFetchingModels).toBe(false))
    const oldClear = result.current.clearHistory()
    rerender({
      ...sessionProps,
      profile: { ...sessionProfile, id: "session-b" },
    })
    await waitFor(() => expect(result.current.isFetchingModels).toBe(false))
    let running!: Promise<void>
    act(() => {
      running = result.current.runSingleProbe("text-generation")
    })
    await act(async () => {
      clearing.resolve(true)
      await oldClear
    })
    expect(
      result.current.probes.find(
        (row) => row.definition.id === "text-generation",
      )?.isRunning,
    ).toBe(true)
    await act(async () => {
      probe.resolve(acceptedProbe)
      await running
    })
  })

  it.each(["pass", "fail"] as const)(
    "keeps the credential verification mode for %s results",
    async (status) => {
      const user = userEvent.setup()
      if (status === "fail") {
        mockRunApiVerificationProbe.mockRejectedValueOnce(
          new Error("Probe failed"),
        )
      } else {
        mockRunApiVerificationProbe.mockResolvedValueOnce({
          id: "text-generation",
          status: "pass",
          latencyMs: 1,
          summary: "Text generation succeeded",
          mode: "non-streaming",
        })
      }
      render(
        <VerifyApiCredentialProfileDialog
          isOpen
          onClose={() => {}}
          initialModelId="gpt-test"
          profile={{
            id: "p-1",
            name: "Profile",
            apiType: API_TYPES.OPENAI_COMPATIBLE,
            baseUrl: "https://example.invalid",
            apiKey: "sk-synthetic",
            tagIds: [],
            notes: "",
            createdAt: 1,
            updatedAt: 1,
          }}
        />,
      )

      const modeSelect = await screen.findByRole("combobox", {
        name: "aiApiVerification:verifyDialog.meta.mode",
      })
      expect(modeSelect).toHaveTextContent(
        "aiApiVerification:verifyDialog.modes.streaming",
      )
      await user.click(modeSelect)
      await user.click(
        await screen.findByRole("option", {
          name: "aiApiVerification:verifyDialog.modes.nonStreaming",
        }),
      )
      const probeCard = screen.getByTestId(
        getApiCredentialProfileVerifyProbeTestId("text-generation"),
      )
      await user.click(
        within(probeCard).getByRole("button", {
          name: "aiApiVerification:verifyDialog.actions.runOne",
        }),
      )

      await waitFor(() =>
        expect(mockRunApiVerificationProbe).toHaveBeenCalledWith(
          expect.objectContaining({
            mode: "non-streaming",
            probeId: "text-generation",
          }),
        ),
      )
      expect(
        await within(probeCard).findByText(
          "aiApiVerification:verifyDialog.modes.nonStreaming",
        ),
      ).toBeVisible()
      const target = requireHistoryTarget(
        createProfileModelVerificationHistoryTarget("p-1", "gpt-test"),
      )
      await waitFor(async () => {
        const summary =
          await verificationResultHistoryStorage.getLatestSummary(target)
        expect(summary?.probes).toEqual([
          expect.objectContaining({
            id: "text-generation",
            status,
            mode: "non-streaming",
          }),
        ])
      })
    },
  )

  it("renders probe items before running", async () => {
    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p-1",
          name: "Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
      />,
    )

    const sourceLink = await screen.findByRole("link", {
      name: "https://example.com",
    })
    expect(sourceLink).toHaveAttribute("href", "https://example.com")
    expect(sourceLink).toHaveAttribute("target", "_blank")
    expect(
      await screen.findByText("aiApiVerification:verifyDialog.probes.models"),
    ).toBeInTheDocument()
    expect(
      await screen.findByText(
        "aiApiVerification:verifyDialog.probes.text-generation",
      ),
    ).toBeInTheDocument()
    expect(
      await screen.findByText(
        "aiApiVerification:verifyDialog.probes.tool-calling",
      ),
    ).toBeInTheDocument()
  })

  it("marks only the full suite busy while it runs", async () => {
    const user = userEvent.setup()
    const deferredProbe = createDeferred<{
      id: string
      status: "pass"
      latencyMs: number
      summary: string
    }>()
    mockRunApiVerificationProbe
      .mockReturnValueOnce(deferredProbe.promise)
      .mockImplementation(async (params: { probeId: string }) => ({
        id: params.probeId,
        status: "pass",
        latencyMs: 1,
        summary: "OK",
      }))

    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "profile-1",
          name: "Example profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://api.example.invalid",
          apiKey: "example-api-key",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
      />,
    )

    const suiteButton = await screen.findByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.run",
    })
    await user.click(suiteButton)

    // A running suite replaces Run with an interruptible Stop, so the suite can
    // no longer be started a second time from this button.
    const runningSuiteButton = await screen.findByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.stop",
    })
    expect(runningSuiteButton).toBeEnabled()
    expect(runningSuiteButton).toHaveAttribute("aria-busy", "true")

    const probeButtons = screen.getAllByTestId(
      API_CREDENTIAL_PROFILES_TEST_IDS.verifyProbeRunButton,
    )
    const runningProbeButton = probeButtons.find(
      (probeButton) => probeButton.getAttribute("aria-busy") === "true",
    )
    // Only the probe that is actually executing carries the progress state, and
    // the suite's own Stop is the way to interrupt it.
    expect(runningProbeButton).toBeDefined()
    expect(runningProbeButton).toHaveTextContent(
      "aiApiVerification:verifyDialog.actions.stop",
    )
    for (const probeButton of probeButtons) {
      expect(probeButton).toBeDisabled()
    }
    expect(
      screen.getByRole("button", {
        name: "aiApiVerification:verifyDialog.actions.close",
      }),
    ).not.toHaveAttribute("aria-busy")

    expect(mockRunApiVerificationProbe).toHaveBeenCalledTimes(1)

    deferredProbe.resolve({
      id: "models",
      status: "pass",
      latencyMs: 1,
      summary: "OK",
    })

    await waitFor(() => {
      const restoredButton = screen.getByRole("button", {
        name: "aiApiVerification:verifyDialog.actions.run",
      })
      expect(restoredButton).toBeEnabled()
      expect(restoredButton).not.toHaveAttribute("aria-busy")
    })
  })

  it("stops the running suite and reports the interrupted probe as stopped", async () => {
    const user = userEvent.setup()
    const deferredProbe = createDeferred<{
      id: string
      status: "pass"
      latencyMs: number
      summary: string
    }>()
    let probeSignal: AbortSignal | undefined
    mockRunApiVerificationProbe.mockImplementationOnce(
      (params: { abortSignal?: AbortSignal }) => {
        probeSignal = params.abortSignal
        return deferredProbe.promise
      },
    )

    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "profile-1",
          name: "Example profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://api.example.invalid",
          apiKey: "example-api-key",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "aiApiVerification:verifyDialog.actions.run",
      }),
    )
    await waitFor(() => expect(probeSignal).toBeDefined())
    expect(probeSignal?.aborted).toBe(false)

    await user.click(
      await screen.findByRole("button", {
        name: "aiApiVerification:verifyDialog.actions.stop",
      }),
    )
    expect(probeSignal?.aborted).toBe(true)

    // The provider may settle a cancelled request either way, so the suite has
    // to treat the completed probe as interrupted rather than as a pass.
    await act(async () => {
      deferredProbe.resolve({
        id: "models",
        status: "pass",
        latencyMs: 1,
        summary: "OK",
      })
    })

    await waitFor(() => {
      const restoredButton = screen.getByRole("button", {
        name: "aiApiVerification:verifyDialog.actions.run",
      })
      expect(restoredButton).toBeEnabled()
    })
    expect(
      screen.getByText("aiApiVerification:verifyDialog.summaries.stopped"),
    ).toBeVisible()
  })

  it("stops a single probe when its request rejects after abort", async () => {
    const user = userEvent.setup()
    let probeSignal: AbortSignal | undefined
    mockRunApiVerificationProbe.mockImplementationOnce(
      ({ abortSignal }: { abortSignal?: AbortSignal }) => {
        probeSignal = abortSignal
        return new Promise((_resolve, reject) => {
          abortSignal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          )
        })
      },
    )

    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "profile-1",
          name: "Example profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://api.example.invalid",
          apiKey: "example-api-key",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
      />,
    )

    const probeCard = await screen.findByTestId(
      getApiCredentialProfileVerifyProbeTestId("models"),
    )
    const probeButton = within(probeCard).getByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.runOne",
    })
    await user.click(probeButton)
    await waitFor(() =>
      expect(probeButton).toHaveAccessibleName(
        "aiApiVerification:verifyDialog.actions.stopProbe",
      ),
    )

    await user.click(probeButton)

    expect(probeSignal?.aborted).toBe(true)
    await waitFor(() =>
      expect(probeButton).toHaveAccessibleName(
        "aiApiVerification:verifyDialog.actions.retry",
      ),
    )
    expect(
      within(probeCard).getByText(
        "aiApiVerification:verifyDialog.summaries.stopped",
      ),
    ).toBeVisible()
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Cancelled,
    )
  })

  it("tracks an empty verification suite as skipped", async () => {
    const user = userEvent.setup()
    mockProbeDefinitions.mockReturnValue([])

    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "profile-1",
          name: "Example profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://api.example.invalid",
          apiKey: "example-api-key",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "aiApiVerification:verifyDialog.actions.run",
      }),
    )

    await waitFor(() =>
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Skipped,
      ),
    )
    expect(mockRunApiVerificationProbe).not.toHaveBeenCalled()
  })

  it("marks only the initiating probe busy through rejected execution and persistence", async () => {
    const user = userEvent.setup()
    const deferredProbe = createDeferred<never>()
    const persistDeferred =
      createDeferred<
        Awaited<
          ReturnType<
            typeof verificationResultHistoryStorage.upsertLatestSummary
          >
        >
      >()
    vi.spyOn(
      verificationResultHistoryStorage,
      "upsertLatestSummary",
    ).mockImplementationOnce(() => persistDeferred.promise)
    mockRunApiVerificationProbe.mockResolvedValue({
      id: "models",
      status: "pass",
      latencyMs: 1,
      summary: "OK",
    })
    mockRunApiVerificationProbe.mockReturnValueOnce(deferredProbe.promise)

    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "profile-1",
          name: "Example profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://api.example.invalid",
          apiKey: "example-api-key",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
        initialModelId="model-1"
      />,
    )

    const initiatingProbe = await screen.findByTestId(
      getApiCredentialProfileVerifyProbeTestId("models"),
    )
    const siblingProbe = await screen.findByTestId(
      getApiCredentialProfileVerifyProbeTestId("text-generation"),
    )
    const initiatingButton = within(initiatingProbe).getByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.runOne",
    })
    const siblingButton = within(siblingProbe).getByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.runOne",
    })
    const suiteButton = screen.getByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.run",
    })

    await user.click(initiatingButton)

    await waitFor(() => {
      expect(initiatingButton).toHaveAccessibleName(
        "aiApiVerification:verifyDialog.actions.stopProbe",
      )
    })
    // A single probe run is interruptible from its own row, so the button stays
    // actionable while it carries the progress state.
    expect(initiatingButton).toBeEnabled()
    expect(initiatingButton).toHaveAttribute("aria-busy", "true")
    expect(siblingButton).toBeDisabled()
    expect(siblingButton).toHaveAccessibleName(
      "aiApiVerification:verifyDialog.actions.runOne",
    )
    expect(siblingButton).not.toHaveAttribute("aria-busy")
    expect(suiteButton).toBeDisabled()
    expect(suiteButton).not.toHaveAttribute("aria-busy")

    // A disabled sibling cannot start a second probe while one is in flight.
    fireEvent.click(siblingButton)
    expect(mockRunApiVerificationProbe).toHaveBeenCalledTimes(1)

    deferredProbe.reject(new Error("probe failed"))

    await waitFor(() => {
      expect(
        verificationResultHistoryStorage.upsertLatestSummary,
      ).toHaveBeenCalledTimes(1)
    })
    // Persistence is part of the run, so the button stays busy until it settles
    // even though the aborted request already returned.
    expect(initiatingButton).toHaveAccessibleName(
      "aiApiVerification:verifyDialog.actions.running",
    )
    expect(initiatingButton).toHaveAttribute("aria-busy", "true")
    // Nothing is abortable in this window, so the row must not accept a restart.
    expect(initiatingButton).toBeDisabled()

    persistDeferred.reject(new Error("persist failed"))

    await waitFor(() => {
      expect(initiatingButton).toHaveAccessibleName(
        "aiApiVerification:verifyDialog.actions.retry",
      )
      expect(initiatingButton).toBeEnabled()
      expect(initiatingButton).not.toHaveAttribute("aria-busy")
      expect(siblingButton).toBeEnabled()
    })

    await user.click(initiatingButton)
    await waitFor(() => {
      expect(mockRunApiVerificationProbe).toHaveBeenCalledTimes(2)
      expect(initiatingButton).toHaveAccessibleName(
        "aiApiVerification:verifyDialog.actions.retry",
      )
      expect(initiatingButton).toBeEnabled()
      expect(initiatingButton).not.toHaveAttribute("aria-busy")
    })
  })

  it("auto-fetches models in upstream order without a brand preference", async () => {
    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce([
      "ada-1",
      "gpt-4o-mini",
    ])

    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p-1",
          name: "Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
      />,
    )

    await waitFor(() =>
      expect(mockFetchOpenAICompatibleModelIds).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          abortSignal: expect.any(AbortSignal),
        }),
      ),
    )
    expect(mockFetchOpenAICompatibleModelIds).toHaveBeenCalledTimes(1)

    await waitFor(() => {
      expect(
        screen.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.verifyModelId),
      ).toHaveTextContent("ada-1")
    })
  })

  it("aborts the in-flight model fetch when switching API types", async () => {
    const user = userEvent.setup()
    let receivedSignal: AbortSignal | undefined
    mockFetchOpenAICompatibleModelIds.mockImplementationOnce(
      ({ abortSignal }: { abortSignal?: AbortSignal }) => {
        receivedSignal = abortSignal
        return new Promise<string[]>((resolve) => {
          abortSignal?.addEventListener(
            "abort",
            () => resolve(["late-model"]),
            { once: true },
          )
        })
      },
    )

    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p-1",
          name: "Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
      />,
    )

    await waitFor(() => expect(receivedSignal).toBeDefined())
    await selectApiTypeOption(user)

    expect(receivedSignal?.aborted).toBe(true)
    await waitFor(() => {
      expect(mockFetchAnthropicModelIds).toHaveBeenCalledWith(
        expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
      )
    })
    expect(
      screen.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.verifyModelId),
    ).not.toHaveTextContent("late-model")
  })

  it("ignores aborted model-fetch rejections when switching API types", async () => {
    const user = userEvent.setup()
    let receivedSignal: AbortSignal | undefined
    mockFetchOpenAICompatibleModelIds.mockImplementationOnce(
      ({ abortSignal }: { abortSignal?: AbortSignal }) => {
        receivedSignal = abortSignal
        return new Promise<string[]>((_resolve, reject) => {
          abortSignal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          )
        })
      },
    )

    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p-1",
          name: "Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
      />,
    )

    await waitFor(() => expect(receivedSignal).toBeDefined())
    await selectApiTypeOption(user)

    expect(receivedSignal?.aborted).toBe(true)
    await waitFor(() => {
      expect(mockFetchAnthropicModelIds).toHaveBeenCalled()
    })
    expect(
      screen.queryByText("apiCredentialProfiles:verify.modelsFetchFailed"),
    ).not.toBeInTheDocument()
  })

  it("retranslates model-discovery fallback without fetching or resetting again", async () => {
    const i18n = await createResourceTestI18n({
      en: {
        apiCredentialProfiles: (
          await import("~/locales/en/apiCredentialProfiles.json")
        ).default,
      },
      "zh-CN": {
        apiCredentialProfiles: (
          await import("~/locales/zh-CN/apiCredentialProfiles.json")
        ).default,
      },
    })
    mockFetchOpenAICompatibleModelIds.mockRejectedValueOnce(new Error())
    const profile = {
      id: "language-profile",
      name: "Profile",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://example.invalid",
      apiKey: "sk-test",
      tagIds: [],
      notes: "",
      createdAt: 1,
      updatedAt: 1,
    }
    render(
      <I18nextProvider i18n={i18n}>
        <VerifyApiCredentialProfileDialog
          isOpen
          onClose={() => {}}
          profile={profile}
          initialModelId="draft-model"
        />
      </I18nextProvider>,
    )
    expect(
      await screen.findByText(
        i18n.t("apiCredentialProfiles:verify.modelsFetchFailed"),
      ),
    ).toBeVisible()
    const calls = mockFetchOpenAICompatibleModelIds.mock.calls.length
    await act(async () => {
      await i18n.changeLanguage("zh-CN")
    })
    expect(
      screen.getByText(
        i18n.t("apiCredentialProfiles:verify.modelsFetchFailed"),
      ),
    ).toBeVisible()
    expect(mockFetchOpenAICompatibleModelIds).toHaveBeenCalledTimes(calls)
    expect(mockRunApiVerificationProbe).not.toHaveBeenCalled()
  })

  it("redacts secrets when the initial model fetch fails", async () => {
    mockFetchOpenAICompatibleModelIds.mockRejectedValueOnce(
      new Error("401 https://example.com sk-test invalid"),
    )

    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p-1",
          name: "Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
      />,
    )

    await waitFor(() => {
      expect(
        screen.getByText("401 [REDACTED] [REDACTED] invalid"),
      ).toBeInTheDocument()
    })

    expect(screen.queryByText(/sk-test/)).not.toBeInTheDocument()
    expect(loggerErrorMock).toHaveBeenCalledWith("Failed to fetch models", {
      message: "401 [REDACTED] [REDACTED] invalid",
    })
  })

  it("runs a single probe and shows collapsible input/output", async () => {
    const user = userEvent.setup()

    mockRunApiVerificationProbe.mockResolvedValueOnce({
      id: "models",
      status: "pass",
      latencyMs: 12,
      summary: "Fetched models",
      input: { endpoint: "/v1/models" },
      output: { modelCount: 1 },
    })

    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p-1",
          name: "Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
      />,
    )

    const probeCard = await screen.findByTestId(
      getApiCredentialProfileVerifyProbeTestId("models"),
    )
    await user.click(
      within(probeCard).getByRole("button", {
        name: "aiApiVerification:verifyDialog.actions.runOne",
      }),
    )

    await waitFor(() =>
      expect(mockRunApiVerificationProbe).toHaveBeenCalledTimes(1),
    )

    expect(
      await within(probeCard).findByText("Fetched models"),
    ).toBeInTheDocument()
    expect(mockStartProductAnalyticsAction).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunApiCredentialProbe,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesDialog,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )

    await user.click(
      within(probeCard).getByRole("button", {
        name: "aiApiVerification:verifyDialog.details.input",
      }),
    )
    expect(
      await within(probeCard).findByText(/"endpoint":/),
    ).toBeInTheDocument()

    expect(
      await within(probeCard).findByText(/"modelCount": 1/),
    ).toBeInTheDocument()
  })

  it("tracks an unsupported single probe as skipped", async () => {
    const user = userEvent.setup()
    mockRunApiVerificationProbe.mockResolvedValueOnce({
      id: "models",
      status: API_VERIFICATION_PROBE_STATUSES.Unsupported,
      latencyMs: 1,
      summary: "Not supported",
    })

    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p-1",
          name: "Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
      />,
    )

    const probeCard = await screen.findByTestId(
      getApiCredentialProfileVerifyProbeTestId("models"),
    )
    await user.click(
      within(probeCard).getByRole("button", {
        name: "aiApiVerification:verifyDialog.actions.runOne",
      }),
    )

    await waitFor(() =>
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Skipped,
      ),
    )
  })

  it("redacts baseUrl and apiKey when a probe throws", async () => {
    const user = userEvent.setup()

    mockRunApiVerificationProbe.mockRejectedValueOnce(
      new Error("https://example.com sk-test probe failed"),
    )

    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p-1",
          name: "Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
      />,
    )

    const probeCard = await screen.findByTestId(
      getApiCredentialProfileVerifyProbeTestId("models"),
    )
    await user.click(
      within(probeCard).getByRole("button", {
        name: "aiApiVerification:verifyDialog.actions.runOne",
      }),
    )

    await waitFor(() =>
      expect(loggerErrorMock).toHaveBeenCalledWith("Probe failed", {
        probeId: "models",
        message: "[REDACTED] [REDACTED] probe failed",
      }),
    )
    expect(
      within(probeCard).queryByText(
        "aiApiVerification:verifyDialog.modes.streaming",
      ),
    ).not.toBeInTheDocument()
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      },
    )
  })

  it("auto-fills model id from the models probe output", async () => {
    const user = userEvent.setup()

    mockRunApiVerificationProbe.mockResolvedValueOnce({
      id: "models",
      status: "pass",
      latencyMs: 12,
      summary: "Fetched models",
      output: {
        modelCount: 2,
        suggestedModelId: "m2",
        modelIdsPreview: ["m1", "m2"],
      },
    })

    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p-1",
          name: "Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
      />,
    )

    const modelsProbeCard = await screen.findByTestId(
      getApiCredentialProfileVerifyProbeTestId("models"),
    )
    await user.click(
      within(modelsProbeCard).getByRole("button", {
        name: "aiApiVerification:verifyDialog.actions.runOne",
      }),
    )

    await waitFor(() =>
      expect(mockRunApiVerificationProbe).toHaveBeenCalledTimes(1),
    )

    await waitFor(() => {
      expect(
        screen.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.verifyModelId),
      ).toHaveTextContent("m2")
    })
  })

  it("keeps the saved profile apiType when the fetched model belongs to another vendor", async () => {
    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce([
      "claude-3-5-sonnet",
    ])

    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p-1",
          name: "Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
      />,
    )

    expect(await screen.findByText("claude-3-5-sonnet")).toBeVisible()
    expect(
      screen.getByRole("combobox", {
        name: "aiApiVerification:verifyDialog.meta.model",
      }),
    ).toHaveTextContent("claude-3-5-sonnet")
    expect(getApiTypeSelect()).toHaveValue(API_TYPES.OPENAI_COMPATIBLE)
    expect(mockFetchAnthropicModelIds).not.toHaveBeenCalled()
  })

  it("allows temporarily switching apiType for profile verification", async () => {
    const user = userEvent.setup()

    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["gpt-4o-mini"])
    mockFetchAnthropicModelIds.mockResolvedValueOnce(["claude-3-5-sonnet"])
    mockRunApiVerificationProbe.mockResolvedValueOnce({
      id: "models",
      status: "pass",
      latencyMs: 10,
      summary: "Fetched models",
      output: {
        modelCount: 1,
        suggestedModelId: "claude-3-5-sonnet",
        modelIdsPreview: ["claude-3-5-sonnet"],
      },
    })

    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p-1",
          name: "Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
      />,
    )

    await waitFor(() =>
      expect(mockFetchOpenAICompatibleModelIds).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          abortSignal: expect.any(AbortSignal),
        }),
      ),
    )
    expect(getApiTypeSelect()).toHaveValue(API_TYPES.OPENAI_COMPATIBLE)

    await selectApiTypeOption(user)

    await waitFor(() => {
      expect(getApiTypeSelect()).toHaveValue(API_TYPES.ANTHROPIC)
    })
    expect(
      await screen.findByText("apiCredentialProfiles:verify.override.badge"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("apiCredentialProfiles:verify.override.title"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("apiCredentialProfiles:verify.override.description"),
    ).toBeInTheDocument()

    await waitFor(() =>
      expect(mockFetchAnthropicModelIds).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          abortSignal: expect.any(AbortSignal),
        }),
      ),
    )

    const modelsProbeCard = await screen.findByTestId(
      getApiCredentialProfileVerifyProbeTestId("models"),
    )
    await user.click(
      within(modelsProbeCard).getByRole("button", {
        name: "aiApiVerification:verifyDialog.actions.runOne",
      }),
    )

    await waitFor(() =>
      expect(mockRunApiVerificationProbe).toHaveBeenCalledWith(
        expect.objectContaining({
          apiType: API_TYPES.ANTHROPIC,
          probeId: "models",
        }),
      ),
    )
  })

  it("run all uses models probe suggestion for dependent probes", async () => {
    const user = userEvent.setup()

    mockRunApiVerificationProbe.mockImplementation(async (params: any) => {
      if (params.probeId === "models") {
        return {
          id: "models",
          status: "pass",
          latencyMs: 1,
          summary: "Fetched models",
          output: {
            modelCount: 2,
            suggestedModelId: "m1",
            modelIdsPreview: ["m1", "m2"],
          },
        }
      }

      return {
        id: params.probeId,
        status: "pass",
        latencyMs: 1,
        summary: "OK",
      }
    })

    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p-1",
          name: "Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
      />,
    )

    const closeButton = await screen.findByText(
      "aiApiVerification:verifyDialog.actions.close",
      { selector: "button" },
    )
    const footer = closeButton.parentElement
    if (!footer) throw new Error("Missing modal footer")

    await user.click(
      within(footer).getByRole("button", {
        name: "aiApiVerification:verifyDialog.actions.run",
      }),
    )

    await waitFor(() =>
      expect(mockRunApiVerificationProbe).toHaveBeenCalledTimes(5),
    )

    expect(mockRunApiVerificationProbe).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        probeId: "models",
        modelId: undefined,
      }),
    )

    expect(mockRunApiVerificationProbe).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        probeId: "text-generation",
        modelId: "m1",
      }),
    )
  })

  it("tracks API credential verification suite success", async () => {
    const user = userEvent.setup()

    mockRunApiVerificationProbe.mockImplementation(async (params: any) => ({
      id: params.probeId,
      status: "pass",
      latencyMs: 1,
      summary: "OK",
      output:
        params.probeId === "models"
          ? {
              suggestedModelId: "m1",
              modelIdsPreview: ["m1"],
            }
          : undefined,
    }))

    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p-1",
          name: "Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
      />,
    )

    const closeButton = await screen.findByText(
      "aiApiVerification:verifyDialog.actions.close",
      { selector: "button" },
    )
    const footer = closeButton.parentElement
    if (!footer) throw new Error("Missing modal footer")

    await user.click(
      within(footer).getByRole("button", {
        name: "aiApiVerification:verifyDialog.actions.run",
      }),
    )

    await waitFor(() =>
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
        {
          insights: {
            itemCount: 5,
            successCount: 5,
            failureCount: 0,
          },
        },
      ),
    )

    expect(mockStartProductAnalyticsAction).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunApiCredentialProbeSuite,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesDialog,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("tracks an all-unsupported verification suite as skipped", async () => {
    const user = userEvent.setup()
    mockRunApiVerificationProbe.mockImplementation(async (params: any) => ({
      id: params.probeId,
      status: API_VERIFICATION_PROBE_STATUSES.Unsupported,
      latencyMs: 1,
      summary: "Not supported",
      output:
        params.probeId === "models"
          ? {
              suggestedModelId: "m1",
              modelIdsPreview: ["m1"],
            }
          : undefined,
    }))

    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p-1",
          name: "Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
      />,
    )

    const closeButton = await screen.findByText(
      "aiApiVerification:verifyDialog.actions.close",
      { selector: "button" },
    )
    const footer = closeButton.parentElement
    if (!footer) throw new Error("Missing modal footer")

    await user.click(
      within(footer).getByRole("button", {
        name: "aiApiVerification:verifyDialog.actions.run",
      }),
    )

    await waitFor(() =>
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Skipped,
        {
          insights: {
            itemCount: 5,
            successCount: 0,
            failureCount: 0,
          },
        },
      ),
    )
  })

  it("tracks API credential verification suite failures with an error category", async () => {
    const user = userEvent.setup()

    mockRunApiVerificationProbe.mockResolvedValueOnce({
      id: "models",
      status: "fail",
      latencyMs: 1,
      summary: "Unauthorized",
      output: { inferredHttpStatus: 401 },
    })

    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p-1",
          name: "Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
      />,
    )

    const closeButton = await screen.findByText(
      "aiApiVerification:verifyDialog.actions.close",
      { selector: "button" },
    )
    const footer = closeButton.parentElement
    if (!footer) throw new Error("Missing modal footer")

    await user.click(
      within(footer).getByRole("button", {
        name: "aiApiVerification:verifyDialog.actions.run",
      }),
    )

    await waitFor(() =>
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth,
          insights: {
            itemCount: 1,
            successCount: 0,
            failureCount: 1,
          },
        },
      ),
    )
  })

  it("uses the first known failed probe category for suite analytics", async () => {
    const user = userEvent.setup()

    mockProbeDefinitions.mockReturnValueOnce([
      { id: "models", requiresModelId: false },
      { id: "text-generation", requiresModelId: false },
    ])
    mockRunApiVerificationProbe
      .mockResolvedValueOnce({
        id: "models",
        status: "fail",
        latencyMs: 1,
        summary: "Unknown failure",
      })
      .mockResolvedValueOnce({
        id: "text-generation",
        status: "fail",
        latencyMs: 2,
        summary: "Unauthorized",
        output: { inferredHttpStatus: 401 },
      })
      .mockResolvedValueOnce({
        id: "tool-calling",
        status: "pass",
        latencyMs: 3,
        summary: "OK",
      })
      .mockResolvedValueOnce({
        id: "structured-output",
        status: "pass",
        latencyMs: 4,
        summary: "OK",
      })
      .mockResolvedValueOnce({
        id: "web-search",
        status: "pass",
        latencyMs: 5,
        summary: "OK",
      })

    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p-1",
          name: "Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
        initialModelId="gpt-test"
      />,
    )

    const closeButton = await screen.findByText(
      "aiApiVerification:verifyDialog.actions.close",
      { selector: "button" },
    )
    const footer = closeButton.parentElement
    if (!footer) throw new Error("Missing modal footer")

    await user.click(
      within(footer).getByRole("button", {
        name: "aiApiVerification:verifyDialog.actions.run",
      }),
    )

    await waitFor(() =>
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth,
          insights: {
            itemCount: 5,
            successCount: 3,
            failureCount: 2,
          },
        },
      ),
    )
  })

  it("tracks API credential verification suite probe exceptions with safe structured diagnostics", async () => {
    const user = userEvent.setup()
    const structuredError = Object.assign(
      new Error("https://example.com sk-test unauthorized"),
      { statusCode: 401 },
    )

    mockRunApiVerificationProbe.mockRejectedValueOnce(structuredError)

    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p-1",
          name: "Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
      />,
    )

    const closeButton = await screen.findByText(
      "aiApiVerification:verifyDialog.actions.close",
      { selector: "button" },
    )
    const footer = closeButton.parentElement
    if (!footer) throw new Error("Missing modal footer")

    await user.click(
      within(footer).getByRole("button", {
        name: "aiApiVerification:verifyDialog.actions.run",
      }),
    )

    await waitFor(() =>
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth,
          insights: {
            itemCount: 1,
            successCount: 0,
            failureCount: 1,
          },
        },
      ),
    )
    expect(loggerErrorMock).toHaveBeenCalledWith("Probe failed", {
      probeId: "models",
      message: "[REDACTED] [REDACTED] unauthorized",
    })
  })

  it("tracks API credential verification suite-level exceptions with an error category", async () => {
    const user = userEvent.setup()

    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p-1",
          name: "Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
      />,
    )

    const closeButton = await screen.findByText(
      "aiApiVerification:verifyDialog.actions.close",
      { selector: "button" },
    )
    const footer = closeButton.parentElement
    if (!footer) throw new Error("Missing modal footer")

    mockProbeDefinitions.mockImplementationOnce(() => {
      throw new Error("definitions failed")
    })

    await user.click(
      within(footer).getByRole("button", {
        name: "aiApiVerification:verifyDialog.actions.run",
      }),
    )

    await waitFor(() =>
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        },
      ),
    )
  })

  it("restores persisted history and clears it", async () => {
    const user = userEvent.setup()

    const target = requireHistoryTarget(
      createProfileVerificationHistoryTarget("p-1"),
    )

    const summary = createVerificationHistorySummary({
      target,
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      results: [
        {
          id: "models",
          status: "pass",
          latencyMs: 9,
          summary: "Stored profile history",
        },
      ],
    })

    if (!summary) {
      throw new Error("Expected history summary")
    }

    await verificationResultHistoryStorage.upsertLatestSummary(summary)

    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p-1",
          name: "Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
      />,
    )

    expect(
      await screen.findByText(
        "aiApiVerification:verifyDialog.history.lastVerified",
      ),
    ).toBeInTheDocument()
    expect(
      await screen.findByText("Stored profile history"),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "aiApiVerification:verifyDialog.history.clear",
      }),
    )

    await waitFor(() => {
      expect(
        screen.getByText("aiApiVerification:verifyDialog.status.unverified"),
      ).toBeInTheDocument()
    })
  })

  it("reloads persisted history for the active model and api type", async () => {
    const user = userEvent.setup()

    mockFetchOpenAICompatibleModelIds.mockResolvedValue(["m0", "m1"])
    mockFetchAnthropicModelIds.mockResolvedValue(["claude-3-5-sonnet"])

    const initialTarget = requireHistoryTarget(
      createProfileModelVerificationHistoryTarget("p-1", "m0"),
    )
    const selectedTarget = requireHistoryTarget(
      createProfileModelVerificationHistoryTarget("p-1", "m1"),
    )

    const initialSummary = createVerificationHistorySummary({
      target: initialTarget,
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      preferredModelId: "m0",
      results: [
        {
          id: "models",
          status: "pass",
          latencyMs: 3,
          summary: "Stored m0 history",
        },
      ],
    })
    const selectedSummary = createVerificationHistorySummary({
      target: selectedTarget,
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      preferredModelId: "m1",
      results: [
        {
          id: "models",
          status: "pass",
          latencyMs: 4,
          summary: "Stored m1 history",
        },
      ],
    })

    if (!initialSummary || !selectedSummary) {
      throw new Error("Expected history summaries")
    }

    await verificationResultHistoryStorage.upsertLatestSummary(initialSummary)
    await verificationResultHistoryStorage.upsertLatestSummary(selectedSummary)

    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p-1",
          name: "Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
        initialModelId="m0"
      />,
    )

    expect(await screen.findByText("Stored m0 history")).toBeInTheDocument()

    await user.click(
      screen.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.verifyModelId),
    )
    await user.click(await screen.findByText("m1"))

    await waitFor(() => {
      expect(
        screen.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.verifyModelId),
      ).toHaveTextContent("m1")
    })
    expect(await screen.findByText("Stored m1 history")).toBeInTheDocument()
    expect(screen.queryByText("Stored m0 history")).not.toBeInTheDocument()

    await selectApiTypeOption(user)

    await waitFor(() =>
      expect(
        screen.getAllByText("aiApiVerification:verifyDialog.status.pending"),
      ).not.toHaveLength(0),
    )
    expect(screen.queryByText("Stored m1 history")).not.toBeInTheDocument()

    await selectOpenAICompatibleApiTypeOption(user)

    expect(await screen.findByText("Stored m1 history")).toBeInTheDocument()
  })

  it.each([false, true])(
    "persists model-target history and handles clear failure: %s",
    async (clearFails) => {
      const user = userEvent.setup()

      mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["m0", "m1"])
      mockRunApiVerificationProbe.mockResolvedValueOnce({
        id: "text-generation",
        status: "pass",
        latencyMs: 7,
        summary: "Generated text",
      })

      render(
        <VerifyApiCredentialProfileDialog
          isOpen={true}
          onClose={() => {}}
          profile={{
            id: "p-1",
            name: "Profile",
            apiType: API_TYPES.OPENAI_COMPATIBLE,
            baseUrl: "https://example.com",
            apiKey: "sk-test",
            tagIds: [],
            notes: "",
            createdAt: 1,
            updatedAt: 1,
          }}
          initialModelId="m0"
        />,
      )

      await waitFor(() =>
        expect(mockFetchOpenAICompatibleModelIds).toHaveBeenCalledWith(
          expect.objectContaining({
            baseUrl: "https://example.com",
            apiKey: "sk-test",
            abortSignal: expect.any(AbortSignal),
          }),
        ),
      )

      await user.click(
        screen.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.verifyModelId),
      )
      await user.click(await screen.findByText("m1"))

      await waitFor(() => {
        expect(
          screen.getByTestId(API_CREDENTIAL_PROFILES_TEST_IDS.verifyModelId),
        ).toHaveTextContent("m1")
      })

      const probeCard = await screen.findByTestId(
        getApiCredentialProfileVerifyProbeTestId("text-generation"),
      )
      await user.click(
        within(probeCard).getByRole("button", {
          name: "aiApiVerification:verifyDialog.actions.runOne",
        }),
      )

      await waitFor(() =>
        expect(mockRunApiVerificationProbe).toHaveBeenCalledWith(
          expect.objectContaining({
            probeId: "text-generation",
            modelId: "m1",
          }),
        ),
      )

      const initialTarget = requireHistoryTarget(
        createProfileModelVerificationHistoryTarget("p-1", "m0"),
      )
      const selectedTarget = requireHistoryTarget(
        createProfileModelVerificationHistoryTarget("p-1", "m1"),
      )

      expect(
        await verificationResultHistoryStorage.getLatestSummary(initialTarget),
      ).toBeNull()
      expect(
        await verificationResultHistoryStorage.getLatestSummary(selectedTarget),
      ).toMatchObject({
        targetKey: "profile:p-1:model:m1",
        resolvedModelId: "m1",
      })

      const clearSpy = vi.spyOn(verificationResultHistoryStorage, "clearTarget")
      if (clearFails)
        clearSpy.mockRejectedValueOnce(new Error("History unavailable"))
      await user.click(
        screen.getByRole("button", {
          name: "aiApiVerification:verifyDialog.history.clear",
        }),
      )

      if (clearFails) {
        await waitFor(() =>
          expect(loggerErrorMock).toHaveBeenCalledWith(
            "Failed to clear verification history",
            expect.anything(),
          ),
        )
        expect(
          await verificationResultHistoryStorage.getLatestSummary(
            selectedTarget,
          ),
        ).toMatchObject({ resolvedModelId: "m1" })
        expect(
          within(probeCard).getByText("Generated text"),
        ).toBeInTheDocument()
        return
      }
      await waitFor(async () => {
        expect(
          await verificationResultHistoryStorage.getLatestSummary(
            selectedTarget,
          ),
        ).toBeNull()
      })
    },
  )

  it("waits for persistence to settle before enabling close controls", async () => {
    const user = userEvent.setup()
    const persistDeferred =
      createDeferred<
        Awaited<
          ReturnType<
            typeof verificationResultHistoryStorage.upsertLatestSummary
          >
        >
      >()
    vi.spyOn(
      verificationResultHistoryStorage,
      "upsertLatestSummary",
    ).mockImplementation(() => persistDeferred.promise)

    mockRunApiVerificationProbe.mockResolvedValueOnce({
      id: "models",
      status: "pass",
      latencyMs: 12,
      summary: "Fetched models",
    })

    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p-1",
          name: "Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
      />,
    )

    const closeButton = await screen.findByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.close",
    })
    const clearButton = screen.getByRole("button", {
      name: "aiApiVerification:verifyDialog.history.clear",
    })
    const probeCard = await screen.findByTestId(
      getApiCredentialProfileVerifyProbeTestId("models"),
    )

    await user.click(
      within(probeCard).getByRole("button", {
        name: "aiApiVerification:verifyDialog.actions.runOne",
      }),
    )

    await waitFor(() => {
      expect(within(probeCard).getByText("Fetched models")).toBeInTheDocument()
      expect(closeButton).toBeDisabled()
      expect(clearButton).toBeDisabled()
    })

    persistDeferred.reject(new Error("persist failed"))

    await waitFor(() => {
      expect(closeButton).toBeEnabled()
      expect(clearButton).toBeEnabled()
    })

    expect(within(probeCard).getByText("Fetched models")).toBeInTheDocument()
    expect(
      screen.queryByText("aiApiVerification:verifyDialog.errors.unexpected"),
    ).not.toBeInTheDocument()
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "Failed to persist verification history",
      { error: expect.any(Error) },
    )
  })

  it("dynamically adapts probes and notices for embedding and image modalities", async () => {
    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce([
      "text-embedding-3-small",
      "dall-e-3",
    ])

    const { rerender } = render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p-1",
          name: "Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
        initialModelId="text-embedding-3-small"
      />,
    )

    // Embedding model: renders models and embeddings probes, hides streaming/non-streaming mode selector
    expect(
      await screen.findByTestId(
        getApiCredentialProfileVerifyProbeTestId("models"),
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId(getApiCredentialProfileVerifyProbeTestId("embedding")),
    ).toBeInTheDocument()
    expect(
      screen.queryByTestId(
        getApiCredentialProfileVerifyProbeTestId("text-generation"),
      ),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("combobox", {
        name: "aiApiVerification:verifyDialog.meta.mode",
      }),
    ).not.toBeInTheDocument()

    // Switch to image model: shows image probe and cost notice
    rerender(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p-1",
          name: "Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
        initialModelId="dall-e-3"
      />,
    )

    expect(
      await screen.findByTestId(
        getApiCredentialProfileVerifyProbeTestId("image-generation"),
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText("aiApiVerification:verifyDialog.modalityNotice.image"),
    ).toBeInTheDocument()
  })

  it("displays video modality notice when configured for a video model", async () => {
    render(
      <VerifyApiCredentialProfileDialog
        isOpen={true}
        onClose={() => {}}
        profile={{
          id: "p-1",
          name: "Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-test",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
        initialModelId="sora-1"
      />,
    )

    expect(
      await screen.findByTestId(
        getApiCredentialProfileVerifyProbeTestId("video-generation"),
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText("aiApiVerification:verifyDialog.modalityNotice.video"),
    ).toBeInTheDocument()
  })

  it("offers the drawing test for a text profile and hides it for embedding models", async () => {
    const { result } = renderHook(useProfileVerification, {
      initialProps: sessionProps,
    })
    await waitFor(() => expect(result.current.isFetchingModels).toBe(false))

    expect(result.current.modelModality).toBe("text")
    expect(result.current.tools.canRunPelican).toBe(true)

    act(() => result.current.setModelId("text-embedding-3-small"))

    await waitFor(() => expect(result.current.modelModality).toBe("embedding"))
    expect(result.current.tools.canRunPelican).toBe(false)
  })

  it("blocks closing the profile dialog while a drawing test runs", async () => {
    mockRunPelicanTest.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(useProfileVerification, {
      initialProps: sessionProps,
    })
    await waitFor(() => expect(result.current.isFetchingModels).toBe(false))
    expect(result.current.canClose).toBe(true)

    act(() => result.current.tools.runPelican())

    await waitFor(() => expect(result.current.tools.isRunning).toBe(true))
    expect(result.current.canClose).toBe(false)
  })

  it("sends the profile's custom request headers to the drawing test", async () => {
    mockRunPelicanTest.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(useProfileVerification, {
      initialProps: {
        ...sessionProps,
        profile: {
          ...sessionProfile,
          requestHeaders: { "X-Tenant": "acme" },
        },
      },
    })
    await waitFor(() => expect(result.current.isFetchingModels).toBe(false))

    act(() => result.current.tools.runPelican())

    await waitFor(() =>
      expect(mockRunPelicanTest).toHaveBeenCalledWith(
        expect.objectContaining({ requestHeaders: { "X-Tenant": "acme" } }),
      ),
    )
  })

  it("renders the shared verification tools in the profile dialog", async () => {
    render(<VerifyApiCredentialProfileDialog {...sessionProps} />)

    expect(
      await screen.findByRole("region", {
        name: "aiApiVerification:verifyDialog.tools.pelican.title",
      }),
    ).toBeInTheDocument()
  })
})
