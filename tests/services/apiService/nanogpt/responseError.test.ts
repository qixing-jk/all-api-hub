import { expect, it } from "vitest"

import { decodeNanoGptResponseError } from "~/services/apiService/nanogpt/responseError"

it.each([
  [null, null],
  [{}, null],
  [{ error: 3 }, null],
  [
    { error: 3, message: " rejected " },
    { kind: "http", message: "rejected" },
  ],
  [
    { error: false, message: " rejected " },
    { kind: "http", message: "rejected" },
  ],
  [{ error: false }, null],
  [
    { error: " denied " },
    { kind: "http", message: "denied", upstreamCode: "denied" },
  ],
  [
    { error: "denied", message: " custom " },
    { kind: "http", message: "custom", upstreamCode: "denied" },
  ],
  [{ error: {} }, null],
  [
    { error: { type: " auth " } },
    { kind: "http", message: "auth", upstreamCode: "auth" },
  ],
  [
    { error: { code: " denied ", message: " detail " } },
    { kind: "http", message: "detail", upstreamCode: "denied" },
  ],
  [{ error: { message: " detail " } }, { kind: "http", message: "detail" }],
  [
    { error: { message: " " }, message: "fallback" },
    { kind: "http", message: "fallback" },
  ],
] as const)(
  "decodes provider error %j without inventing a message",
  (body, expected) => {
    expect(
      decodeNanoGptResponseError(
        { body, ok: false, status: 400, headers: {} },
        { endpoint: "/fixture" },
      ),
    ).toEqual(expected)
  },
)
