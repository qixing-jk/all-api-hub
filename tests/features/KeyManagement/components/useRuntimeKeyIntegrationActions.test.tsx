import { act, renderHook } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"

import { useRuntimeKeyIntegrationActions } from "~/features/KeyManagement/components/RuntimeKeyActions/useRuntimeKeyIntegrationActions"
import { buildServiceCredentialRuntimeKey } from "~/services/accounts/keys/accountRuntimeKeys"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), feedback: vi.fn() }))
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: unknown) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
}))
vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: () => ({ managedSiteType: "new-api" }),
}))
vi.mock("~/contexts/FeatureGuidanceContext", () => ({
  useFeatureGuidanceContext: () => ({
    markGatewayGuidanceOnboardingCompleted: vi.fn(),
  }),
}))
vi.mock("~/components/dialogs/ChannelDialog", () => ({
  useChannelDialog: () => ({ openWithAccount: vi.fn() }),
}))
vi.mock("~/services/accounts/utils/apiServiceRequest", () => ({
  resolveDisplayAccountRuntimeKeySecret: mocks.resolve,
}))
vi.mock("~/utils/feedback/operationFeedback", () => ({
  showResultToast: mocks.feedback,
}))
vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: () => ({ complete: vi.fn() }),
}))

beforeEach(() => {
  mocks.resolve.mockReset()
  mocks.feedback.mockReset()
})

it.each([null, new Error("")])(
  "uses a safe fallback for an empty export failure",
  async (error) => {
    mocks.resolve.mockRejectedValue(error)
    const account = buildDisplaySiteData()
    const runtimeKey = buildServiceCredentialRuntimeKey(account, {
      kind: "singleton_service_key",
      service: "codex",
      label: "Key",
      key: "sk-private",
      isAuthenticated: true,
    })
    const { result } = renderHook(() =>
      useRuntimeKeyIntegrationActions({ account, runtimeKey, enabled: true }),
    )
    await act(async () => {
      await result.current.exportActions.openCherryStudio()
    })
    expect(mocks.feedback).toHaveBeenCalledWith({
      success: false,
      message:
        'messages:errors.operation.failed:{"error":"messages:errors.unknown"}',
    })
  },
)

it("redacts the runtime secret from a failed export", async () => {
  mocks.resolve.mockRejectedValue(new Error("failed using sk-private"))
  const account = buildDisplaySiteData()
  const runtimeKey = buildServiceCredentialRuntimeKey(account, {
    kind: "singleton_service_key",
    service: "codex",
    label: "Key",
    key: "sk-private",
    isAuthenticated: true,
  })
  const { result } = renderHook(() =>
    useRuntimeKeyIntegrationActions({ account, runtimeKey, enabled: true }),
  )
  await act(async () => {
    await result.current.exportActions.openCherryStudio()
  })
  expect(mocks.feedback.mock.calls[0]?.[0].message).not.toContain("sk-private")
  expect(mocks.feedback.mock.calls[0]?.[0].message).toContain("[REDACTED]")
})
