import { readFileSync } from "node:fs"
import { expect, it } from "vitest"

it("allows Chrome and Edge policy profiles to coexist on the same Mac", () => {
  const identities: string[] = []
  for (const browser of ["chrome", "edge"]) {
    const xml = readFileSync(
      `resources/crx-self-update/${browser}-install-policy.mobileconfig`,
      "utf8",
    )
    const profile = new DOMParser().parseFromString(xml, "application/xml")
    expect(profile.querySelector("parsererror")).toBeNull()
    const keys = Array.from(profile.querySelectorAll("key"))
    for (const key of keys) {
      if (
        ["PayloadIdentifier", "PayloadUUID"].includes(key.textContent ?? "")
      ) {
        identities.push(key.nextElementSibling?.textContent ?? "")
      }
    }
  }
  // Both top-level profiles and their browser payloads need independent identities.
  expect(identities).toHaveLength(8)
  expect(new Set(identities).size).toBe(8)
  expect(identities).not.toContain("")
})
