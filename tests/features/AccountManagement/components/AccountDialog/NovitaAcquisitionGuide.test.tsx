import userEvent from "@testing-library/user-event"
import { expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import AutoDetectErrorAlert from "~/features/AccountManagement/components/AccountDialog/detection/AutoDetectErrorAlert"
import { AutoDetectErrorType } from "~/services/accounts/utils/autoDetectUtils"
import { createTab } from "~/utils/browser/tabs"
import { render, screen } from "~~/tests/test-utils/render"

vi.mock("~/utils/browser/tabs", async (original) => ({
  ...(await original<typeof import("~/utils/browser/tabs")>()),
  createTab: vi.fn(),
}))

it("opens Novita key management with provider-specific guidance and prepares key input", async () => {
  const onPrepareAccessTokenInput = vi.fn()
  render(
    <AutoDetectErrorAlert
      error={{
        type: AutoDetectErrorType.ACCESS_TOKEN_VERIFICATION_REQUIRED,
        message: "Create a Novita API key",
        canUseApiCredentialFallback: false,
      }}
      siteType={SITE_TYPES.NOVITA}
      siteUrl="https://novita.ai"
      onPrepareAccessTokenInput={onPrepareAccessTokenInput}
    />,
  )
  await userEvent.setup().click(
    await screen.findByRole("button", {
      name: "accountDialog:accessTokenVerification.novita.openPage",
    }),
  )
  expect(onPrepareAccessTokenInput).toHaveBeenCalledOnce()
  expect(createTab).toHaveBeenCalledWith(
    "https://novita.ai/settings/key-management",
    true,
  )
  expect(
    screen.queryByText("accountDialog:apiCredentialFallback.title"),
  ).not.toBeInTheDocument()
})
