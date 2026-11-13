import { render, screen } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { expect, it } from "vitest"

import { VerificationProbeResult } from "~/features/Verification/api/VerificationProbeResult"
import en from "~/locales/en/aiApiVerification.json"
import { VERIFICATION_GENERATION_PART_TYPES } from "~/services/verification/aiApiVerification/generationProgress"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"

it.each([true, false])(
  "shows accepted reasoning after transient progress clears and uses the final answer (draft: %s)",
  async (hasDraft) => {
    const i18n = await createResourceTestI18n({ en: { aiApiVerification: en } })
    const result = {
      summary: "Accepted answer",
      output: { text: "Final answer" },
      generation: {
        text: "stale draft",
        reasoning: "Check the evidence",
        tools: [],
        step: 1,
        parts: [
          {
            id: "reasoning",
            step: 1,
            type: VERIFICATION_GENERATION_PART_TYPES.Reasoning,
            text: "Check the evidence",
          },
          ...(hasDraft
            ? [
                {
                  id: "answer",
                  step: 1,
                  type: VERIFICATION_GENERATION_PART_TYPES.Text,
                  text: "stale draft",
                },
              ]
            : []),
        ],
      },
    }
    render(
      <I18nextProvider i18n={i18n}>
        <VerificationProbeResult
          selected
          result={result}
          generation={{ running: false }}
        />
      </I18nextProvider>,
    )
    expect(screen.getByRole("button", { name: "Reasoning" })).toBeVisible()
    expect(
      screen.getByRole("region", { name: "Model response" }),
    ).toHaveTextContent("Final answer")
    expect(screen.queryByText("stale draft")).not.toBeInTheDocument()
  },
)
