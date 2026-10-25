import { describe, expect, it } from "vitest"

import { createAgentTestInstructions } from "~/services/verification/agentTest/instructions"

describe("Agent test instructions", () => {
  it("describes the environment and the supplied delivery contract without assuming a drawing task", () => {
    const instructions = createAgentTestInstructions({
      artifactPath: "results/report.json",
    })

    expect(instructions).toContain("disposable virtual workspace")
    expect(instructions).toContain('"results/report.json"')
    expect(instructions).toContain("not from your final reply")
    expect(instructions).not.toMatch(/pelican|SVG|viewBox|brief summary/)
  })
})
