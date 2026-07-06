import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { StatusIndicator } from "~/features/ModelList/components/StatusIndicator"
import { MODEL_MANAGEMENT_SOURCE_KINDS } from "~/features/ModelList/modelManagementSources"

const { openSiteSupportRequestPageMock } = vi.hoisted(() => ({
  openSiteSupportRequestPageMock: vi.fn(),
}))

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>()

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
    }),
  }
})

vi.mock("~/utils/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/navigation")>()

  return {
    ...actual,
    openSiteSupportRequestPage: openSiteSupportRequestPageMock,
  }
})

const ACCOUNT = {
  id: "account-1",
  name: "VoAPI v2 Demo",
  baseUrl: "https://example.invalid",
  siteType: SITE_TYPES.VO_API_V2,
} as any

const ACCOUNT_SOURCE = {
  kind: MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT,
  value: "account:account-1",
  account: ACCOUNT,
  capabilities: {
    supportsPricing: false,
    supportsRatioDisplay: false,
    supportsGroupFiltering: false,
    supportsAccountSummary: false,
    supportsTokenCompatibility: true,
    supportsCredentialVerification: true,
    supportsBatchCredentialVerification: true,
    supportsCliVerification: true,
  },
} as any

describe("StatusIndicator", () => {
  beforeEach(() => {
    openSiteSupportRequestPageMock.mockReset()
    openSiteSupportRequestPageMock.mockResolvedValue(undefined)
  })

  it("shows an unsupported model-list state with a site-support request action", async () => {
    const user = userEvent.setup()

    render(
      <StatusIndicator
        selectedSource={ACCOUNT_SOURCE}
        isLoading={false}
        dataFormatError={false}
        loadErrorMessage={null}
        currentAccount={ACCOUNT}
        loadPricingData={vi.fn()}
        accountFallback={null}
        unsupportedSource={true}
      />,
    )

    expect(screen.getByRole("status")).toHaveTextContent(
      "status.unsupportedSourceTitle",
    )
    expect(
      screen.getByText("status.unsupportedSourceDescription"),
    ).toBeVisible()

    await user.click(
      screen.getByRole("button", {
        name: "status.requestSiteSupport",
      }),
    )

    expect(openSiteSupportRequestPageMock).toHaveBeenCalledWith({
      siteUrl: "https://example.invalid",
      errorType: "model_list_unsupported",
      errorMessage: "status.unsupportedSourceSupportRequestErrorMessage",
    })
  })
})
