import { expect, it } from "vitest"

import { isProtectionResponse } from "~/services/protectionBypass/response"

it.each([undefined, "private-body", { success: false }])(
  "recognizes Cloudflare's response signal independent of its body",
  (body) => {
    expect(isProtectionResponse(body, { "CF-Mitigated": "challenge" })).toBe(
      true,
    )
  },
)

it.each([
  ["normal", { server: "cloudflare", "cf-ray": "example" }],
  ["normal", { "cf-mitigated": "unknown" }],
  ['<script src="https://o.alicdn.com/captcha.js"></script>', {}],
  [{ message: '<meta name="aliyun_waf_aa">' }, {}],
] as const)(
  "does not infer a challenge from infrastructure or SDK presence",
  (body, headers) => {
    expect(isProtectionResponse(body, headers)).toBe(false)
  },
)

it("recognizes the observed Aliyun HTML with no provider or domain argument", () => {
  expect(isProtectionResponse('<meta name="aliyun_waf_bb">')).toBe(true)
})
