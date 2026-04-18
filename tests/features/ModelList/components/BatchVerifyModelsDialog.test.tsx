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
      await screen.findByText("Text generation succeeded"),
    ).toBeInTheDocument()
    expect(
      await screen.findByText("modelList:batchVerify.tokenUsed"),
    ).toBeInTheDocument()
    expect(mockUpsertLatestSummary).toHaveBeenCalledTimes(1)
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
