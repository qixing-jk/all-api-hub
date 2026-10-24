import { render, screen } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { describe, expect, it } from "vitest"

import { VerificationRequestProfileBadge } from "~/features/Verification/api/VerificationRequestProfile"
import { API_VERIFICATION_REQUEST_PROFILES } from "~/services/verification/aiApiVerification/types"
import { testI18n } from "~~/tests/test-utils/i18n"

describe("verification result client identity", () => {
  it.each([undefined, API_VERIFICATION_REQUEST_PROFILES.Default])(
    "omits the badge for ordinary results (%s)",
    (profile) => {
      const { container } = render(
        <I18nextProvider i18n={testI18n}>
          <VerificationRequestProfileBadge profile={profile} />
        </I18nextProvider>,
      )
      expect(container).toBeEmptyDOMElement()
    },
  )

  it.each([
    API_VERIFICATION_REQUEST_PROFILES.Codex,
    API_VERIFICATION_REQUEST_PROFILES.Claude,
    API_VERIFICATION_REQUEST_PROFILES.Gemini,
  ])("labels recorded %s identity and enhancement", (profile) => {
    const { rerender } = render(
      <I18nextProvider i18n={testI18n}>
        <VerificationRequestProfileBadge profile={profile} />
      </I18nextProvider>,
    )
    const label = `aiApiVerification:verifyDialog.requestProfiles.${profile}`
    expect(screen.getByText(label)).toBeVisible()
    rerender(
      <I18nextProvider i18n={testI18n}>
        <VerificationRequestProfileBadge profile={profile} enhanced />
      </I18nextProvider>,
    )
    expect(
      screen.getByText(
        `${label} · aiApiVerification:verifyDialog.requestProfiles.enhancedBadge`,
      ),
    ).toBeVisible()
  })
})
