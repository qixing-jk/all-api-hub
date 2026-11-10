import { expect, it } from "vitest"

import { readBrowserLoginJson } from "~/services/browserLogin/contentResponse"

it.each([
  new Response("private challenge body", {
    status: 403,
    headers: { "cf-mitigated": "challenge" },
  }),
  new Response('<meta name="aliyun_waf_aa" content="private challenge">'),
])(
  "classifies a protected login response before JSON parsing %#",
  async (response) => {
    await expect(readBrowserLoginJson(response)).rejects.toMatchObject({
      message: "verification_required",
      reason: "verification_required",
      mutationRisk: false,
    })
  },
)

it("preserves a JSON login result that mentions challenge markup", async () => {
  const payload = { success: true, message: '<meta name="aliyun_waf_aa">' }
  await expect(readBrowserLoginJson(Response.json(payload))).resolves.toEqual(
    payload,
  )
})

it("redacts a malformed login response", async () => {
  await expect(
    readBrowserLoginJson(new Response("private invalid JSON")),
  ).rejects.toMatchObject({
    message: "invalid_response",
    reason: "invalid_response",
    mutationRisk: false,
  })
})
