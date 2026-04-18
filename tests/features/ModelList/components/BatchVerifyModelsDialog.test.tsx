import { beforeEach, describe, expect, it, vi } from "vitest"

import { BatchVerifyModelsDialog } from "~/features/ModelList/components/BatchVerifyModelsDialog"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { fireEvent, render, screen, waitFor } from "~~/tests/test-utils/render"

const mockFetchDisplayAccountTokens = vi.fn()
const mockResolveDisplayAccountTokenForSecret = vi.fn()
const mockRunApiVerificationProbe = vi.fn()
const mockUpsertLatestSummary = vi.fn()

vi.mock("~/services/accounts/utils/apiServiceRequest", () => ({
  fetchDisplayAccountTokens: (...args: any[]) =>
    mockFetchDisplayAccountTokens(...args),
  resolveDisplayAccountTokenForSecret: (...args: any[]) =>
    mockResolveDisplayAccountTokenForSecret(...args),
}))

vi.mock("~/services/verification/aiApiVerification", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/verification/aiApiVerification")
    >()
  return {
    ...actual,
    runApiVerificationProbe: (...args: any[]) =>
      mockRunApiVerificationProbe(...args),
  }
})

vi.mock(
  "~/services/verification/verificationResultHistory",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/verification/verificationResultHistory")
      >()
    return {
      ...actual,
      verificationResultHistoryStorage: {
        ...actual.verificationResultHistoryStorage,
        upsertLatestSummary: (...args: any[]) =>
          mockUpsertLatestSummary(...args),
      },
    }
  },
)

const account = {
  id: "acc-1",
  name: "Account One",
  baseUrl: "https://api.example.com",
  siteType: "newapi",
  token: "account-token",
  cookieAuthSessionCookie: "",
  authType: "access_token",
  userId: 1,
} as any

function renderDialog(items: any[]) {
  return render(
    <BatchVerifyModelsDialog isOpen={true} onClose={() => {}} items={items} />,
  )
}

describe("BatchVerifyModelsDialog", () => {
  beforeEach(() => {
    mockFetchDisplayAccountTokens.mockReset()
    mockResolveDisplayAccountTokenForSecret.mockReset()
    mockRunApiVerificationProbe.mockReset()
    mockUpsertLatestSummary.mockReset()
    mockUpsertLatestSummary.mockImplementation(async (summary) => summary)
  })

  it("uses the first compatible account token and runs text-generation for the model", async () => {
    mockFetchDisplayAccountTokens.mockResolvedValueOnce([
      {
        id: 1,
        name: "default-token",
        key: "masked",
        status: 1,
        group: "default",
        model_limits_enabled: false,
        model_limits: "",
        models: "",
      },
    ])
    mockResolveDisplayAccountTokenForSecret.mockResolvedValueOnce({
      id: 1,
      name: "default-token",
      key: "sk-real",
      status: 1,
      group: "default",
      model_limits_enabled: false,
      model_limits: "",
      models: "",
    })
    mockRunApiVerificationProbe.mockResolvedValueOnce({
      id: "text-generation",
      status: "pass",
      latencyMs: 12,
      summary: "Text generation succeeded",
    })

    renderDialog([
      {
        key: "account:acc-1:model:gpt-4o",
        modelId: "gpt-4o",
        enableGroups: ["default"],
        source: { kind: "account", account },
      },
    ])

    fireEvent.click(
      await screen.findByRole("button", {
        name: "modelList:batchVerify.actions.start",
      }),
    )

    await waitFor(() => {
      expect(mockRunApiVerificationProbe).toHaveBeenCalledWith({
        baseUrl: "https://api.example.com",
        apiKey: "sk-real",
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        modelId: "gpt-4o",
        tokenMeta: {
          id: 1,
          name: "default-token",
          model_limits: "",
          models: "",
        },
        probeId: "text-generation",
      })
    })
    expect(
      await screen.findByText("modelList:batchVerify.messages.probeSummary"),
    ).toBeInTheDocument()
    expect(
      screen.getAllByText(
        "aiApiVerification:verifyDialog.probes.text-generation",
      ).length,
    ).toBeGreaterThan(0)
    expect(
      await screen.findByText("modelList:batchVerify.tokenUsed"),
    ).toBeInTheDocument()
    expect(mockUpsertLatestSummary).toHaveBeenCalledTimes(1)
  })

  it("runs the selected probe set for each model and persists combined results", async () => {
    mockFetchDisplayAccountTokens.mockResolvedValueOnce([
      {
        id: 1,
        name: "default-token",
        key: "masked",
        status: 1,
        group: "default",
        model_limits_enabled: false,
        model_limits: "",
        models: "",
      },
    ])
    mockResolveDisplayAccountTokenForSecret.mockResolvedValueOnce({
      id: 1,
      name: "default-token",
      key: "sk-real",
      status: 1,
      group: "default",
      model_limits_enabled: false,
      model_limits: "",
      models: "",
    })
    mockRunApiVerificationProbe
      .mockResolvedValueOnce({
        id: "text-generation",
        status: "pass",
        latencyMs: 12,
        summary: "Text generation succeeded",
      })
      .mockResolvedValueOnce({
        id: "tool-calling",
        status: "pass",
        latencyMs: 18,
        summary: "Tool calling succeeded",
      })

    renderDialog([
      {
        key: "account:acc-1:model:gpt-4o",
        modelId: "gpt-4o",
        enableGroups: ["default"],
        source: { kind: "account", account },
      },
    ])

    fireEvent.click(
      await screen.findByText(
        "aiApiVerification:verifyDialog.probes.tool-calling",
      ),
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "modelList:batchVerify.actions.start",
      }),
    )

    await waitFor(() => {
      expect(mockRunApiVerificationProbe).toHaveBeenCalledTimes(2)
    })
    expect(mockRunApiVerificationProbe).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ probeId: "text-generation" }),
    )
    expect(mockRunApiVerificationProbe).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ probeId: "tool-calling" }),
    )
    expect(mockUpsertLatestSummary).toHaveBeenCalledTimes(1)
    expect(mockUpsertLatestSummary.mock.calls[0][0].probes).toEqual([
      expect.objectContaining({ id: "text-generation", status: "pass" }),
      expect.objectContaining({ id: "tool-calling", status: "pass" }),
    ])
  })

  it("requires at least one selected probe before starting", async () => {
    renderDialog([
      {
        key: "account:acc-1:model:gpt-4o",
        modelId: "gpt-4o",
        enableGroups: ["default"],
        source: { kind: "account", account },
      },
    ])

    fireEvent.click(
      await screen.findByText(
        "aiApiVerification:verifyDialog.probes.text-generation",
      ),
    )

    expect(
      screen.getByRole("button", {
        name: "modelList:batchVerify.actions.start",
      }),
    ).toBeDisabled()
    expect(
      screen.getByText("modelList:batchVerify.probes.noneSelected"),
    ).toBeInTheDocument()
  })

  it("defaults to all models selected and only runs checked models", async () => {
    mockFetchDisplayAccountTokens.mockResolvedValue([
      {
        id: 1,
        name: "default-token",
        key: "masked",
        status: 1,
        group: "default",
        model_limits_enabled: false,
        model_limits: "",
        models: "",
      },
    ])
    mockResolveDisplayAccountTokenForSecret.mockResolvedValue({
      id: 1,
      name: "default-token",
      key: "sk-real",
      status: 1,
      group: "default",
      model_limits_enabled: false,
      model_limits: "",
      models: "",
    })
    mockRunApiVerificationProbe.mockResolvedValueOnce({
      id: "text-generation",
      status: "pass",
      latencyMs: 12,
      summary: "Selected model ok",
    })

    renderDialog([
      {
        key: "account:acc-1:model:gpt-4o",
        modelId: "gpt-4o",
        enableGroups: ["default"],
        source: { kind: "account", account },
      },
      {
        key: "account:acc-1:model:gpt-4o-mini",
        modelId: "gpt-4o-mini",
        enableGroups: ["default"],
        source: { kind: "account", account },
      },
    ])

    expect(
      await screen.findByTestId(
        "batch-verify-model-checkbox-account:acc-1:model:gpt-4o",
      ),
    ).toBeChecked()
    expect(
      screen.getByTestId(
        "batch-verify-model-checkbox-account:acc-1:model:gpt-4o-mini",
      ),
    ).toBeChecked()

    fireEvent.click(
      screen.getByTestId(
        "batch-verify-model-checkbox-account:acc-1:model:gpt-4o",
      ),
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "modelList:batchVerify.actions.start",
      }),
    )

    await waitFor(() => {
      expect(mockRunApiVerificationProbe).toHaveBeenCalledTimes(1)
    })
    expect(mockRunApiVerificationProbe).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: "gpt-4o-mini",
        probeId: "text-generation",
      }),
    )
    expect(
      await screen.findByText("modelList:batchVerify.messages.notSelected"),
    ).toBeInTheDocument()
  })

  it("requires at least one selected model before starting", async () => {
    renderDialog([
      {
        key: "account:acc-1:model:gpt-4o",
        modelId: "gpt-4o",
        enableGroups: ["default"],
        source: { kind: "account", account },
      },
    ])

    fireEvent.click(
      await screen.findByRole("button", {
        name: "modelList:batchVerify.modelSelection.clearAll",
      }),
    )

    expect(
      screen.getByRole("button", {
        name: "modelList:batchVerify.actions.start",
      }),
    ).toBeDisabled()
    expect(
      screen.getByText("modelList:batchVerify.modelSelection.noneSelected"),
    ).toBeInTheDocument()
  })

  it("skips an account model when no compatible token exists", async () => {
    mockFetchDisplayAccountTokens.mockResolvedValueOnce([
      {
        id: 1,
        name: "vip-token",
        key: "masked",
        status: 1,
        group: "vip",
        model_limits_enabled: false,
        model_limits: "",
        models: "",
      },
    ])

    renderDialog([
      {
        key: "account:acc-1:model:gpt-4o",
        modelId: "gpt-4o",
        enableGroups: ["default"],
        source: { kind: "account", account },
      },
    ])

    fireEvent.click(
      await screen.findByRole("button", {
        name: "modelList:batchVerify.actions.start",
      }),
    )

    expect(
      await screen.findByText(
        "modelList:batchVerify.messages.noCompatibleToken",
      ),
    ).toBeInTheDocument()
    expect(mockRunApiVerificationProbe).not.toHaveBeenCalled()
    expect(mockUpsertLatestSummary).toHaveBeenCalledTimes(1)
  })

  it("runs profile-backed models with the profile api type and without account tokens", async () => {
    mockRunApiVerificationProbe.mockResolvedValueOnce({
      id: "text-generation",
      status: "pass",
      latencyMs: 8,
      summary: "Profile model ok",
    })

    renderDialog([
      {
        key: "profile:profile-1:model:claude-3-5-sonnet",
        modelId: "claude-3-5-sonnet",
        enableGroups: [],
        source: {
          kind: "profile",
          profile: {
            id: "profile-1",
            name: "Profile One",
            baseUrl: "https://anthropic.example.com",
            apiKey: "profile-secret",
            apiType: API_TYPES.ANTHROPIC,
          },
        },
      },
    ])

    fireEvent.click(
      await screen.findByRole("button", {
        name: "modelList:batchVerify.actions.start",
      }),
    )

    await waitFor(() => {
      expect(mockRunApiVerificationProbe).toHaveBeenCalledWith({
        baseUrl: "https://anthropic.example.com",
        apiKey: "profile-secret",
        apiType: API_TYPES.ANTHROPIC,
        modelId: "claude-3-5-sonnet",
        tokenMeta: undefined,
        probeId: "text-generation",
      })
    })
    expect(mockFetchDisplayAccountTokens).not.toHaveBeenCalled()
  })
})
