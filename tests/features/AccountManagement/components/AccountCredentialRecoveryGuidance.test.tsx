import { expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { AccountCredentialRecoveryGuidance } from "~/features/AccountManagement/credentialRecovery/AccountCredentialRecoveryGuidance"
import { AuthTypeEnum } from "~/types"
import { render, screen } from "~~/tests/test-utils/render"

const account = {
  siteType: SITE_TYPES.ANYROUTER,
  authType: AuthTypeEnum.Cookie,
  baseUrl: "https://anyrouter.top",
}
it.each([account, { ...account, siteType: SITE_TYPES.NEW_API }])(
  "hides recovery when no eligible destination exists",
  async (target) => {
    render(
      <>
        <span>Guidance ready</span>
        <AccountCredentialRecoveryGuidance account={target} />
      </>,
    )
    await screen.findByText("Guidance ready")
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  },
)
it.each([true, false])(
  "shows ordinary configuration guidance (compact: %s)",
  async (compact) => {
    render(
      <AccountCredentialRecoveryGuidance
        account={account}
        onConfigure={vi.fn()}
        compact={compact}
      />,
    )
    expect(
      await screen.findByRole("button", {
        name: "accountDialog:login.configureRecovery",
      }),
    ).toBeVisible()
  },
)
