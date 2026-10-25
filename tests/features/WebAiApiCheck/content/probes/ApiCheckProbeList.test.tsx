import { describe, expect, it, vi } from "vitest"

import { ApiCheckProbeList } from "~/features/WebAiApiCheck/content/probes/ApiCheckProbeList"
import type { ApiVerificationProbeResult } from "~/services/verification/aiApiVerification"
import { testI18n } from "~~/tests/test-utils/i18n"
import { render, screen } from "~~/tests/test-utils/render"

function renderProbe(result: ApiVerificationProbeResult | null) {
  render(
    <ApiCheckProbeList
      t={testI18n.getFixedT(null, [
        "webAiApiCheck",
        "common",
        "aiApiVerification",
      ])}
      probes={[
        {
          id: "text-generation",
          requiresModelId: true,
          isRunning: false,
          attempts: result ? 1 : 0,
          result,
        },
      ]}
      isRunningAll={false}
      isFetchingModels={false}
      onRunProbe={vi.fn()}
      onStopProbe={vi.fn()}
    />,
  )
}

describe("ApiCheckProbeList", () => {
  it.each(["fail", "unsupported"] as const)(
    "keeps the %s status without showing a separate duration",
    async (status) => {
      renderProbe({
        id: "text-generation",
        status,
        latencyMs: 1200,
        summary: "Unavailable",
      })
      expect(
        await screen.findByText(
          `aiApiVerification:verifyDialog.status.${status}`,
        ),
      ).toBeVisible()
      expect(screen.queryByText("1200ms")).not.toBeInTheDocument()
      expect(screen.queryByText("1.2s")).not.toBeInTheDocument()
    },
  )

  it("shows the same pending status as interface verification before a run", async () => {
    renderProbe(null)
    expect(
      await screen.findByText("aiApiVerification:verifyDialog.status.pending"),
    ).toBeVisible()
  })

  it("shows successful latency only in the formatted status badge", async () => {
    renderProbe({
      id: "text-generation",
      status: "pass",
      latencyMs: 1200,
      summary: "Completed",
    })
    expect(await screen.findAllByText("1.2s")).toHaveLength(1)
    expect(screen.queryByText("1200ms")).not.toBeInTheDocument()
  })
})
