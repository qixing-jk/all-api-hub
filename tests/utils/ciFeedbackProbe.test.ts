import { expect, test } from "vitest"

test("intentional CI-only failure for measuring early feedback", () => {
  const probeEnabled =
    process.env.AAH_CI_FEEDBACK_PROBE === "1" ||
    process.env.GITHUB_REF === "refs/heads/perf/ci-feedback-probe-20261104"
  expect(1).toBe(probeEnabled ? 2 : 1)
})
