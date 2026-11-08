import { render, screen } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { describe, expect, it, vi } from "vitest"

import {
  VerificationRequestProfileBadge,
  VerificationRequestProfileHint,
  VerificationRequestProfileSelect,
} from "~/features/Verification/api/VerificationRequestProfile"
import zhCN from "~/locales/zh-CN/aiApiVerification.json"
import { API_VERIFICATION_REQUEST_PROFILES } from "~/services/verification/aiApiVerification/types"
import { createResourceTestI18n, testI18n } from "~~/tests/test-utils/i18n"

it.each([
  ["claude", "Claude Code"],
  ["codex", "Codex CLI"],
  ["gemini", "Gemini CLI"],
] as const)(
  "names the selected %s client in shortcut guidance",
  async (profile, client) => {
    const i18n = await createResourceTestI18n(
      { "zh-CN": { aiApiVerification: zhCN } },
      "zh-CN",
    )
    render(
      <I18nextProvider i18n={i18n}>
        <VerificationRequestProfileHint profile={profile} />
      </I18nextProvider>,
    )
    expect(screen.getByRole("note")).toHaveTextContent(
      `已选择 ${client}，你可以直接运行测试，或切换其他客户端。`,
    )
  },
)

describe("verification result client identity", () => {
  it.each([
    ["codex", "anthropic", true],
    ["claude", "openai-compatible", true],
    ["gemini", "openai", true],
    ["codex", "openai", false],
    ["claude", "anthropic", false],
    ["gemini", "google", false],
    ["default", "anthropic", false],
  ] as const)(
    "warns about %s with %s only when needed",
    (value, apiType, warning) => {
      render(
        <I18nextProvider i18n={testI18n}>
          <VerificationRequestProfileSelect
            value={value}
            apiType={apiType}
            onChange={vi.fn()}
          />
        </I18nextProvider>,
      )
      if (warning)
        expect(screen.getByRole("alert")).toHaveTextContent(
          "aiApiVerification:verifyDialog.requestProfiles.protocolMismatch",
        )
      else expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    },
  )

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
