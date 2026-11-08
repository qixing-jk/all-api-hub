import { render, screen } from "@testing-library/react"
import type { ComponentProps } from "react"
import { beforeEach, expect, it, vi } from "vitest"

import type { VerifyApiCredentialProfileDialog } from "~/features/ApiCredentialProfiles/verification/VerifyApiCredentialProfileDialog"
import type { VerifyApiDialog } from "~/features/Verification/api"
import { VerifyCliSupportDialog } from "~/features/Verification/cli"
import { API_VERIFICATION_REQUEST_PROFILES } from "~/services/verification/aiApiVerification"
import {
  buildApiCredentialProfile,
  buildDisplaySiteData,
} from "~~/tests/test-utils/factories"

const accountView = vi.hoisted(() =>
  vi.fn<(props: ComponentProps<typeof VerifyApiDialog>) => React.ReactNode>(
    () => <div>Account workspace</div>,
  ),
)
const profileView = vi.hoisted(() =>
  vi.fn<
    (
      props: ComponentProps<typeof VerifyApiCredentialProfileDialog>,
    ) => React.ReactNode
  >(() => <div>Profile workspace</div>),
)
vi.mock("~/features/Verification/api", () => ({ VerifyApiDialog: accountView }))
vi.mock(
  "~/features/ApiCredentialProfiles/verification/VerifyApiCredentialProfileDialog",
  () => ({ VerifyApiCredentialProfileDialog: profileView }),
)
beforeEach(() => {
  accountView.mockImplementation(() => <div>Account workspace</div>)
  profileView.mockImplementation(() => <div>Profile workspace</div>)
})
it.each([
  API_VERIFICATION_REQUEST_PROFILES.Claude,
  API_VERIFICATION_REQUEST_PROFILES.Codex,
  API_VERIFICATION_REQUEST_PROFILES.Gemini,
] as const)("opens the account workspace preset for %s", (client) => {
  const account = buildDisplaySiteData()
  render(
    <VerifyCliSupportDialog
      isOpen
      onClose={() => {}}
      account={account}
      initialModelId="test"
      modelEnableGroups={["vip"]}
      initialClient={client}
    />,
  )
  expect(screen.getByText("Account workspace")).toBeInTheDocument()
  expect(accountView.mock.lastCall?.[0]).toMatchObject({
    account,
    initialModelId: "test",
    modelEnableGroups: ["vip"],
    initialRequestProfile: client,
  })
})
it("opens the profile workspace from a generic CLI shortcut", () => {
  const profile = buildApiCredentialProfile()
  render(<VerifyCliSupportDialog isOpen onClose={() => {}} profile={profile} />)
  expect(screen.getByText("Profile workspace")).toBeInTheDocument()
  expect(profileView.mock.lastCall?.[0]).toMatchObject({
    profile,
    initialRequestProfile: "claude",
  })
})
