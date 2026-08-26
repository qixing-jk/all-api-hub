import { vi } from "vitest"

import { PRODUCT_ANALYTICS_ERROR_CATEGORIES } from "~/services/productAnalytics/contracts"

/**
 * Shared mock declarations for the ApiCheckModalHost tests. Every split
 * test file must side-effect import this module as its FIRST import so
 * the hoisted vi.mock registrations apply to that test module graph.
 */
const {
  startProductAnalyticsActionMock,
  completeProductAnalyticsActionMock,
  updateWebAiApiCheckMock,
  upsertVerificationHistorySummaryMock,
} = vi.hoisted(() => ({
  startProductAnalyticsActionMock: vi.fn(),
  completeProductAnalyticsActionMock: vi.fn(),
  updateWebAiApiCheckMock: vi.fn(),
  upsertVerificationHistorySummaryMock: vi.fn(),
}))

export {
  startProductAnalyticsActionMock,
  completeProductAnalyticsActionMock,
  updateWebAiApiCheckMock,
  upsertVerificationHistorySummaryMock,
}

vi.mock("~/services/productAnalytics/actions", () => ({
  resolveProductAnalyticsErrorCategoryFromError: (error: unknown) =>
    error &&
    typeof error === "object" &&
    (error as { statusCode?: unknown }).statusCode === 401
      ? PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth
      : PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
  startProductAnalyticsAction: startProductAnalyticsActionMock,
}))

vi.mock("~/services/preferences/userPreferences", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/preferences/userPreferences")
    >()
  return {
    ...actual,
    userPreferences: {
      ...actual.userPreferences,
      updateWebAiApiCheck: updateWebAiApiCheckMock,
    },
  }
})

vi.mock("react-hot-toast/headless", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
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

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    sendRuntimeMessage: vi.fn(),
  }
})

vi.mock(
  "~/services/verification/webAiApiCheck/messaging",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/verification/webAiApiCheck/messaging")
      >()
    return {
      ...actual,
      sendWebAiApiCheckMessage: vi.fn(),
    }
  },
)

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
        upsertLatestSummary: upsertVerificationHistorySummaryMock,
      },
    }
  },
)
