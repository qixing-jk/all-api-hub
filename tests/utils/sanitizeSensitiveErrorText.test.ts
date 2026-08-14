import { describe, expect, it } from "vitest"

import { sanitizeSensitiveErrorText } from "~/utils/core/sanitizeSensitiveErrorText"

describe("sanitizeSensitiveErrorText", () => {
  it("redacts common credential shapes while preserving useful diagnostics", () => {
    const sanitized = sanitizeSensitiveErrorText(
      "Provider rejected Bearer bearer.secret-123, eyJhbGciOiJIUzI1NiJ9.payload.signature, and sk-sensitivekey12345 with status 403",
    )

    expect(sanitized).toContain("Provider rejected")
    expect(sanitized).toContain("status 403")
    expect(sanitized).toContain("Bearer [REDACTED]")
    expect(sanitized).not.toContain("bearer.secret-123")
    expect(sanitized).not.toContain("eyJhbGciOiJIUzI1NiJ9.payload.signature")
    expect(sanitized).not.toContain("sk-sensitivekey12345")
  })

  it("removes sensitive URL suffixes and named secret values", () => {
    expect(
      sanitizeSensitiveErrorText(
        "Request https://api.example.invalid/v1?api_key=secret#debug failed; token=another-secret",
      ),
    ).toBe("Request https://api.example.invalid/v1 failed; token=[REDACTED]")
  })
})
