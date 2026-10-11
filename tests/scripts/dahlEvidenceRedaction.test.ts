import { describe, expect, it } from "vitest"

import {
  redactEvidence,
  redactEvidenceBody,
} from "~~/scripts/utils/evidence-redaction.mjs"

describe("live evidence redaction", () => {
  it("redacts credential headers and nested key secrets without changing balances or source data", () => {
    const capture = {
      requestHeaders: {
        Cookie: "dahl_session=session-example",
        Authorization: "Bearer example",
        Accept: "application/json",
      },
      responseHeaders: {
        "set-cookie": "dahl_session=rotated-example",
        "content-type": "application/json",
      },
      body: {
        keys: [
          { id: 7, token: "dahl_liveexamplecredential", available_tokens: 100 },
        ],
        nested: { api_key: "other-example" },
      },
    }
    expect(redactEvidence(capture)).toEqual({
      requestHeaders: {
        Cookie: "[redacted]",
        Authorization: "[redacted]",
        Accept: "application/json",
      },
      responseHeaders: {
        "set-cookie": "[redacted]",
        "content-type": "application/json",
      },
      body: {
        keys: [{ id: 7, token: "[redacted]", available_tokens: 100 }],
        nested: { api_key: "[redacted]" },
      },
    })
    expect(capture.body.keys[0]?.token).toBe("dahl_liveexamplecredential")
  })

  it("redacts JSON bodies and never persists unparseable credential-bearing bodies", () => {
    expect(
      JSON.parse(
        redactEvidenceBody(
          '{"keys":[{"token":"dahl_liveexamplecredential","id":7}]}',
        ),
      ),
    ).toEqual({ keys: [{ token: "[redacted]", id: 7 }] })
    expect(redactEvidenceBody("unparseable dahl_liveexamplecredential")).toBe(
      "[redacted non-JSON body]",
    )
    expect(redactEvidenceBody(null)).toBeNull()
  })

  it("redacts a plaintext key embedded in a diagnostic string", () => {
    expect(
      redactEvidence({ failure: "Unexpected key dahl_liveexamplecredential" }),
    ).toEqual({ failure: "Unexpected key [redacted]" })
  })
})
