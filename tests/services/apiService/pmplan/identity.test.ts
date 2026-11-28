import { describe, expect, it } from "vitest"

import { parsePmplanIdentity } from "~/services/apiService/pmplan/identity"

describe("PM-Plan console identity", () => {
  it("uses the console user id without inventing a console token", () => {
    expect(
      parsePmplanIdentity({ user: { id: 661, username: "sample" } }),
    ).toEqual({
      id: "661",
      username: "sample",
      access_token: null,
    })
  })
})

it("rejects unrelated envelopes and malformed identities", () => {
  for (const body of [
    null,
    { success: true, data: { id: 661, username: "sample" } },
    { user: { id: "661", username: "sample" } },
    { user: { id: 0, username: "sample" } },
    { user: { id: 1.5, username: "sample" } },
    { user: { id: 661, username: "" } },
  ]) {
    expect(parsePmplanIdentity(body)).toBeNull()
  }
})
