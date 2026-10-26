import { describe, expect, it } from "vitest"

import { consoleKeyBelongsToRun } from "~~/scripts/suites/requesty/ui.mjs"

describe("Requesty live UI console key ownership", () => {
  const reusedCredential = { id: "key-shared", name: "All API Hub" }

  it("never claims a key the pre-run inventory already contained", () => {
    // The dialog prefills a saved management credential, so onboarding can hand
    // back a key this run did not create; revoking it would break the operator's
    // account. The old check matched by name and deleted keys with that name.
    const preRunIds = new Set(["key-shared", "key-other"])

    expect(consoleKeyBelongsToRun(reusedCredential, preRunIds)).toBe(false)
  })

  it("claims a key that the pre-run inventory did not contain", () => {
    const preRunIds = new Set(["key-other"])

    expect(consoleKeyBelongsToRun(reusedCredential, preRunIds)).toBe(true)
    expect(consoleKeyBelongsToRun(reusedCredential, new Set())).toBe(true)
  })

  it("claims nothing when the pre-run inventory could not be read", () => {
    // An unreadable inventory cannot prove ownership, and deleting on that
    // assumption is the destructive failure this guards against.
    expect(consoleKeyBelongsToRun(reusedCredential, null)).toBe(false)
  })
})
