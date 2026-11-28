import { expect, it, vi } from "vitest"

// @ts-expect-error Node-only helper.
import * as cleanup from "~~/scripts/suites/pmplan/keyCleanup.mjs"
// @ts-expect-error Node-only helper.
import * as ui from "~~/scripts/suites/pmplan/ui.mjs"

it("secret comparison failure contains neither secret", () => {
  const failure = (() => {
    try {
      ui.assertPmplanSecretMatch("sk-pm-shown", "sk-pm-returned")
    } catch (error) {
      return error as Error
    }
  })()
  expect(failure?.message).toBe(
    "Displayed key differs from its creation response",
  )
  expect(JSON.stringify(failure)).not.toMatch(/sk-pm-/)
})

it("recovers only uniquely attributable profiles after a lost save observation", () => {
  const input = {
    profiles: [
      { id: "old", apiKey: "secret" },
      { id: "new", apiKey: "secret" },
    ],
    baselineIds: new Set(["old"]),
    secret: "secret",
  }
  expect(ui.findOwnedPmplanProfile(input)?.id).toBe("new")
  expect(
    ui.findOwnedPmplanProfile({ ...input, profiles: [input.profiles[0]] }),
  ).toBeUndefined()
  expect(() =>
    ui.findOwnedPmplanProfile({
      ...input,
      profiles: [...input.profiles, { id: "another", apiKey: "secret" }],
    }),
  ).toThrow("ambiguous")
  expect(() =>
    ui.findOwnedPmplanProfile({ ...input, knownId: "new", secret: "changed" }),
  ).toThrow("altered")
})

it("retains revocation and baseline verification failures in cleanup report", async () => {
  const report = {}
  const readKeys = vi
    .fn()
    .mockRejectedValueOnce(new Error("revocation read failed"))
    .mockRejectedValueOnce(new Error("baseline read failed"))
  const failure = await cleanup
    .finalizePmplanKeys({
      site: {},
      ids: new Set([17]),
      baseline: [{ id: 1 }],
      readKeys,
      report,
    })
    .catch((error: unknown) => error)
  expect(failure).toBeInstanceOf(AggregateError)
  expect(report).toMatchObject({
    cleanup: {
      existingKeysUnchanged: false,
      errors: [
        expect.stringContaining("cleanup failed"),
        "baseline read failed",
      ],
    },
  })
  expect((failure as AggregateError).errors).toHaveLength(2)
})
