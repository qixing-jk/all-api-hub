import { describe, expect, it } from "vitest"

import {
  encodeNanoGptCredentials,
  parseNanoGptCredentials,
} from "~/services/apiService/nanogpt/credentials"

describe("NanoGPT saved credentials", () => {
  it.each([
    undefined,
    "",
    "nanogpt-credentials:bad",
    "nanogpt-credentials:null",
    'nanogpt-credentials:{"apiKey":"a","managementToken":3}',
  ])(
    "never treats malformed paired credentials as an authorization secret: %s",
    (credential) => {
      expect(parseNanoGptCredentials(credential)).toEqual({
        apiKey: "",
        managementToken: "",
      })
    },
  )
  it("round-trips an empty draft and a complete management-only draft", () => {
    expect(encodeNanoGptCredentials({ apiKey: "", managementToken: "" })).toBe(
      "",
    )
    expect(
      encodeNanoGptCredentials({
        apiKey: "",
        managementToken: "sk-nano-mgmt-fixture",
      }),
    ).toBe("sk-nano-mgmt-fixture")
  })
  it("keeps legacy inference keys readable and round-trips two independent credentials", () => {
    const inferenceKey = "f12c54ab-8268-4dea-a4b7-87160e51a19e"
    expect(parseNanoGptCredentials(inferenceKey)).toEqual({
      apiKey: inferenceKey,
      managementToken: "",
    })
    expect(parseNanoGptCredentials("sk-nano-mgmt-fixture")).toEqual({
      apiKey: "",
      managementToken: "sk-nano-mgmt-fixture",
    })
    const pair = {
      apiKey: "sk-nano-fixture",
      managementToken: "sk-nano-mgmt-fixture",
    }
    expect(parseNanoGptCredentials(encodeNanoGptCredentials(pair))).toEqual(
      pair,
    )
    expect(
      encodeNanoGptCredentials({ apiKey: inferenceKey, managementToken: "" }),
    ).toBe(inferenceKey)
    expect(
      parseNanoGptCredentials('nanogpt-credentials:{"apiKey":42}'),
    ).toEqual({ apiKey: "", managementToken: "" })
  })
})

it("preserves the field's credential class while the user is still typing", () => {
  expect(
    parseNanoGptCredentials(
      encodeNanoGptCredentials({ apiKey: "", managementToken: "s" }),
    ),
  ).toEqual({ apiKey: "", managementToken: "s" })
  expect(
    parseNanoGptCredentials(
      encodeNanoGptCredentials({
        apiKey: "sk-nano-mgmt-misplaced",
        managementToken: "",
      }),
    ),
  ).toEqual({ apiKey: "sk-nano-mgmt-misplaced", managementToken: "" })
})
