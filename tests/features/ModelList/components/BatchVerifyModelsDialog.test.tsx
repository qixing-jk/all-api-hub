import { beforeEach, describe, expect, it, vi } from "vitest"

import { BatchVerifyModelsDialog } from "~/features/ModelList/components/BatchVerifyModelsDialog"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { fireEvent, render, screen, waitFor } from "~~/tests/test-utils/render"

const {
  mockFetchDisplayAccountTokens,
  mockGetApiVerificationProbeDefinitions,
  mockResolveDisplayAccountTokenForSecret,
  mockRunApiVerificationProbe,
  mockUpsertLatestSummary,
} = vi.hoisted(() => ({
  mockFetchDisplayAccountTokens: vi.fn(),
  mockGetApiVerificationProbeDefinitions: vi.fn(),
  mockResolveDisplayAccountTokenForSecret: vi.fn(),
  mockRunApiVerificationProbe: vi.fn(),
  mockUpsertLatestSummary: vi.fn(),
}))

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
    getApiVerificationProbeDefinitions: (
      apiType: Parameters<typeof actual.getApiVerificationProbeDefinitions>[0],
    ) =>
      mockGetApiVerificationProbeDefinitions(apiType) ??
      actual.getApiVerificationProbeDefinitions(apiType),
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
    mockGetApiVerificationProbeDefinitions.mockReset()
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

    fireEvent.click(await screen.findByRole("combobox"))
    fireEvent.click(
      await screen.findByRole("option", {
        name: "aiApiVerification:verifyDialog.apiTypes.openai",
      }),
    )
    fireEvent.click(
      await screen.findByRole("button", {
        name: "modelList:batchVerify.actions.start",
      }),
    )

    await waitFor(() => {
      expect(mockRunApiVerificationProbe).toHaveBeenCalledWith({
        baseUrl: "https://api.example.com",
        apiKey: "sk-real",
        apiType: API_TYPES.OPENAI,
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

  it("stops before the next probe and skips persisting partial model results", async () => {
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

    let resolveProbe: (result: any) => void = () => {}
    mockRunApiVerificationProbe.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveProbe = resolve
      }),
    )

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

    const stopButton = await screen.findByRole("button", {
      name: "modelList:batchVerify.actions.stop",
    })
    await waitFor(() => {
      expect(mockRunApiVerificationProbe).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(stopButton)
    resolveProbe({
      id: "text-generation",
      status: "pass",
      latencyMs: 10,
      summary: "Finished before stop",
    })

    expect(
      await screen.findByText("modelList:batchVerify.messages.stopped"),
    ).toBeInTheDocument()
    expect(mockRunApiVerificationProbe).toHaveBeenCalledTimes(1)
    expect(mockUpsertLatestSummary).not.toHaveBeenCalled()
  })

  it("records probe errors and continues when history persistence fails", async () => {
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
    mockRunApiVerificationProbe.mockRejectedValueOnce(new Error("probe failed"))
    mockUpsertLatestSummary.mockRejectedValueOnce(new Error("storage failed"))

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
      expect(mockUpsertLatestSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          probes: [
            expect.objectContaining({
              id: "text-generation",
              status: "fail",
            }),
          ],
        }),
      )
    })
    expect(
      await screen.findByText("modelList:batchVerify.messages.probeSummary"),
    ).toBeInTheDocument()
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

    fireEvent.click(
      screen.getByRole("button", {
        name: "modelList:batchVerify.modelSelection.selectAll",
      }),
    )
    expect(
      screen.getByRole("button", {
        name: "modelList:batchVerify.actions.start",
      }),
    ).toBeEnabled()
  })

  it("marks unsupported-only probe results as skipped", async () => {
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
      status: "unsupported",
      latencyMs: 0,
      summary: "Not supported",
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
      expect(mockUpsertLatestSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          probes: [
            expect.objectContaining({
              id: "text-generation",
              status: "unsupported",
            }),
          ],
        }),
      )
    })
    expect(
      await screen.findByText("modelList:batchVerify.status.skipped"),
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
    expect(mockUpsertLatestSummary).not.toHaveBeenCalled()
  })

  it("skips a model when selected probes do not apply", async () => {
    mockGetApiVerificationProbeDefinitions.mockReturnValue([
      { id: "models", requiresModelId: false },
    ])
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
        "modelList:batchVerify.messages.noApplicableProbes",
      ),
    ).toBeInTheDocument()
    expect(mockRunApiVerificationProbe).not.toHaveBeenCalled()
    expect(mockUpsertLatestSummary).not.toHaveBeenCalled()
  })

  it("persists setup failures with a probe id from the resolved API definitions", async () => {
    mockGetApiVerificationProbeDefinitions.mockReturnValue([
      { id: "models", requiresModelId: false },
    ])
    mockFetchDisplayAccountTokens.mockRejectedValueOnce(
      new Error("temporary token failure"),
    )
    mockUpsertLatestSummary.mockRejectedValueOnce(new Error("storage failed"))

    renderDialog([
      {
        key: "account:acc-1:model:gpt-4o",
        modelId: "gpt-4o",
        enableGroups: ["default"],
        source: { kind: "account", account },
      },
    ])

    fireEvent.click(await screen.findByRole("combobox"))
    fireEvent.click(
      await screen.findByRole("option", {
        name: "aiApiVerification:verifyDialog.apiTypes.openai",
      }),
    )
    fireEvent.click(
      await screen.findByRole("button", {
        name: "modelList:batchVerify.actions.start",
      }),
    )

    await waitFor(() => {
      expect(mockUpsertLatestSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          probes: [expect.objectContaining({ id: "models", status: "fail" })],
        }),
      )
    })
  })

  it("refetches tokens after a failed run when rerunning the batch", async () => {
    mockFetchDisplayAccountTokens
      .mockRejectedValueOnce(new Error("temporary token failure"))
      .mockResolvedValueOnce([
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
      latencyMs: 10,
      summary: "Recovered",
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
      expect(mockFetchDisplayAccountTokens).toHaveBeenCalledTimes(1)
    })

    const rerunButton = await screen.findByRole("button", {
      name: "modelList:batchVerify.actions.rerun",
    })
    await waitFor(() => {
      expect(rerunButton).toBeEnabled()
    })
    fireEvent.click(rerunButton)

    await waitFor(() => {
      expect(mockFetchDisplayAccountTokens).toHaveBeenCalledTimes(2)
    })
    await waitFor(() => {
      expect(mockRunApiVerificationProbe).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: "sk-real",
          modelId: "gpt-4o",
          probeId: "text-generation",
        }),
      )
    })
  })

  it("does not reset an active batch when the item snapshot changes", async () => {
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

    let resolveProbe: (result: any) => void = () => {}
    mockRunApiVerificationProbe.mockReturnValue(
      new Promise((resolve) => {
        resolveProbe = resolve
      }),
    )

    const initialItems: any[] = [
      {
        key: "account:acc-1:model:gpt-4o",
        modelId: "gpt-4o",
        enableGroups: ["default"],
        source: { kind: "account", account },
      },
    ]
    const { rerender } = render(
      <BatchVerifyModelsDialog
        isOpen={true}
        onClose={() => {}}
        items={initialItems}
      />,
    )

    fireEvent.click(
      await screen.findByRole("button", {
        name: "modelList:batchVerify.actions.start",
      }),
    )

    await screen.findByRole("button", {
      name: "modelList:batchVerify.actions.stop",
    })
    rerender(
      <BatchVerifyModelsDialog
        isOpen={true}
        onClose={() => {}}
        items={[
          ...initialItems,
          {
            key: "account:acc-1:model:gpt-4o-mini",
            modelId: "gpt-4o-mini",
            enableGroups: ["default"],
            source: { kind: "account", account },
          },
        ]}
      />,
    )

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "modelList:batchVerify.actions.stop",
        }),
      ).toBeInTheDocument()
    })

    resolveProbe({
      id: "text-generation",
      status: "pass",
      latencyMs: 10,
      summary: "Finished before stop",
    })

    expect(
      await screen.findByRole("button", {
        name: "modelList:batchVerify.actions.rerun",
      }),
    ).toBeInTheDocument()
  })

  it("marks queued models as stopped when the running batch is stopped", async () => {
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

    let resolveProbe: (result: any) => void = () => {}
    const blockedProbe = new Promise((resolve) => {
      resolveProbe = resolve
    })
    mockRunApiVerificationProbe.mockReturnValue(blockedProbe)

    renderDialog(
      Array.from({ length: 6 }, (_, index) => ({
        key: `account:acc-1:model:gpt-4o-${index}`,
        modelId: `gpt-4o-${index}`,
        enableGroups: ["default"],
        source: { kind: "account", account },
      })),
    )

    fireEvent.click(
      await screen.findByRole("button", {
        name: "modelList:batchVerify.actions.start",
      }),
    )

    const stopButton = await screen.findByRole("button", {
      name: "modelList:batchVerify.actions.stop",
    })
    await waitFor(() => {
      expect(mockRunApiVerificationProbe).toHaveBeenCalledTimes(5)
    })

    fireEvent.click(stopButton)
    resolveProbe({
      id: "text-generation",
      status: "pass",
      latencyMs: 10,
      summary: "Finished before stop",
    })

    expect(
      await screen.findByText("modelList:batchVerify.messages.stopped"),
    ).toBeInTheDocument()
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
    await waitFor(() => {
      expect(mockUpsertLatestSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          target: {
            kind: "profile-model",
            profileId: "profile-1",
            modelId: "claude-3-5-sonnet",
          },
        }),
      )
    })
  })
})
