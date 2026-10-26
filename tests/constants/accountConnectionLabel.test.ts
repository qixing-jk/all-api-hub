import { describe, expect, it } from "vitest"

import {
  createAccountConnectionLabel,
  createAccountConnectionShortCode,
} from "~/constants/accountConnectionLabel"
import { createOpenRouterBootstrapLabel } from "~/constants/openRouterBootstrap"

describe("account connection labels", () => {
  it("derives an eight-character short code from a request UUID prefix", () => {
    expect(
      createAccountConnectionShortCode(
        "account-auto-detect-c8f94b6b-88a9-4287-b9f1-22a84e57aa47",
      ),
    ).toBe("c8f94b6b")
    expect(
      createAccountConnectionLabel(
        "account-auto-detect-c8f94b6b-88a9-4287-b9f1-22a84e57aa47",
      ),
    ).toBe("All API Hub - Account Connection (c8f94b6b)")
  })

  it("keeps one stable format across bootstrap flows", () => {
    const requestId = "0f5a4f0e-4a0e-4f00-9000-0123456789ab"
    expect(createOpenRouterBootstrapLabel(requestId)).toBe(
      createAccountConnectionLabel(requestId),
    )
  })

  it("hashes non-UUID request ids without echoing them", () => {
    const requestId = "private-arbitrary-request-identifier"
    const shortCode = createAccountConnectionShortCode(requestId)
    expect(shortCode).toMatch(/^[0-9a-f]{8}$/)
    expect(createAccountConnectionLabel(requestId)).not.toContain(requestId)
    expect(createAccountConnectionShortCode("request-😀")).not.toBe(
      createAccountConnectionShortCode("request-😁"),
    )
  })
})
