import { afterEach, describe, expect, it, vi } from "vitest"

import {
  createOpenRouterFallbackUserId,
  resolveOpenRouterAccountUserId,
  resolveOpenRouterBootstrapIdentity,
} from "~/services/apiAdapters/openrouter/accountIdentity"

describe("createOpenRouterFallbackUserId", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("generates an OpenRouter-local identity from the UUID primitive", () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "00000000-0000-4000-8000-000000000003",
    )

    expect(createOpenRouterFallbackUserId()).toBe(
      "openrouter:00000000-0000-4000-8000-000000000003",
    )
  })
})

describe("resolveOpenRouterBootstrapIdentity", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("uses matching Clerk identity and its normalized display name", () => {
    expect(
      resolveOpenRouterBootstrapIdentity({
        sessionIdentity: {
          userId: "  user_session_placeholder  ",
          username: "  Example Person  ",
        },
        creatorUserId: " user_session_placeholder ",
      }),
    ).toEqual({
      userId: "user_session_placeholder",
      username: "Example Person",
    })
  })

  it("uses Clerk identity when credential metadata has no creator", () => {
    expect(
      resolveOpenRouterBootstrapIdentity({
        sessionIdentity: {
          userId: " user_session_placeholder ",
          username: " person@example.invalid ",
        },
        creatorUserId: "   ",
      }),
    ).toEqual({
      userId: "user_session_placeholder",
      username: "person@example.invalid",
    })
  })

  it("uses creator identity without a display name when Clerk is unavailable", () => {
    expect(
      resolveOpenRouterBootstrapIdentity({
        creatorUserId: " creator_placeholder ",
      }),
    ).toEqual({ userId: "creator_placeholder", username: "" })
  })

  it("prefers creator identity and does not leak Clerk display on mismatch", () => {
    expect(
      resolveOpenRouterBootstrapIdentity({
        sessionIdentity: {
          userId: "session_placeholder",
          username: "other-person@example.invalid",
        },
        creatorUserId: " creator_placeholder ",
      }),
    ).toEqual({ userId: "creator_placeholder", username: "" })
  })

  it("generates a local OpenRouter fallback when neither identity exists", () => {
    const result = resolveOpenRouterBootstrapIdentity({
      creatorUserId: undefined,
    })

    expect(result.username).toBe("")
    expect(result.userId).toMatch(/^openrouter:/)
  })

  it("uses normalized editable identity before credential defaults", () => {
    expect(
      resolveOpenRouterAccountUserId({
        enteredUserId: "  corrected-user  ",
        creatorUserId: "validated-creator",
        existingUserId: "openrouter:00000000-0000-4000-8000-000000000001",
      }),
    ).toBe("corrected-user")
  })

  it("uses the validated creator before a generated local fallback", () => {
    expect(
      resolveOpenRouterAccountUserId({
        enteredUserId: " ",
        creatorUserId: "  validated-creator  ",
        existingUserId: "openrouter:00000000-0000-4000-8000-000000000001",
      }),
    ).toBe("validated-creator")
  })

  it("preserves only a generated OpenRouter fallback when input is blank", () => {
    expect(
      resolveOpenRouterAccountUserId({
        enteredUserId: " ",
        existingUserId: "openrouter:00000000-0000-4000-8000-000000000001",
      }),
    ).toBe("openrouter:00000000-0000-4000-8000-000000000001")

    expect(
      resolveOpenRouterAccountUserId({
        enteredUserId: "",
        existingUserId: "openrouter:1721234567890-a1b2c3d4",
      }),
    ).toBe("openrouter:1721234567890-a1b2c3d4")
  })

  it("generates a reserved fallback when no editable or generated ID is usable", () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "00000000-0000-4000-8000-000000000002",
    )

    expect(
      resolveOpenRouterAccountUserId({
        enteredUserId: "",
        existingUserId: "openrouter:not-a-generated-id",
      }),
    ).toBe("openrouter:00000000-0000-4000-8000-000000000002")
  })
})
