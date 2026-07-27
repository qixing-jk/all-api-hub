import { readFileSync } from "node:fs"
import { describe, expect, expectTypeOf, it } from "vitest"

import {
  isOpenRouterClerkSessionIdentity,
  OPENROUTER_MANAGEMENT_KEY_LABEL_MAX_LENGTH,
  OPENROUTER_MANAGEMENT_KEYS_PATH,
  OPENROUTER_MANAGEMENT_KEYS_URL,
  type TempWindowOpenRouterManagementKeyActionParams,
  type TempWindowOpenRouterManagementKeyActionResult,
  type TempWindowOpenRouterManagementKeyCancelResult,
} from "~/services/apiAdapters/openrouter/managementKeyPageContract"

describe("OpenRouter Management Key page contract", () => {
  it("owns the canonical page route and bounded label contract", () => {
    expect(OPENROUTER_MANAGEMENT_KEYS_PATH).toBe("/settings/management-keys")
    expect(OPENROUTER_MANAGEMENT_KEYS_URL).toMatch(
      /^https:\/\/[^/]+\/settings\/management-keys$/,
    )
    expect(OPENROUTER_MANAGEMENT_KEY_LABEL_MAX_LENGTH).toBe(96)
  })

  it("accepts only exact normalized Clerk identity hints", () => {
    expect(
      isOpenRouterClerkSessionIdentity({
        userId: "user_example",
        username: "Example User",
      }),
    ).toBe(true)
    expect(
      isOpenRouterClerkSessionIdentity({
        userId: " user_example ",
        username: "Example User",
      }),
    ).toBe(false)
    expect(
      isOpenRouterClerkSessionIdentity({
        userId: "user_example",
        username: "Example User",
        extra: true,
      }),
    ).toBe(false)
  })

  it("owns the create and result transport contract", () => {
    expectTypeOf<
      TempWindowOpenRouterManagementKeyActionParams["operation"]
    >().toEqualTypeOf<{ kind: "create"; label: string }>()
    expectTypeOf<
      TempWindowOpenRouterManagementKeyActionResult["operation"]
    >().toEqualTypeOf<"create">()

    type KnownCancellation = Extract<
      TempWindowOpenRouterManagementKeyCancelResult,
      { certainty: "known" }
    >
    type UnknownCancellation = Extract<
      TempWindowOpenRouterManagementKeyCancelResult,
      { certainty: "unknown" }
    >

    expectTypeOf<
      KnownCancellation["cancellationAccepted"]
    >().toEqualTypeOf<boolean>()
    expectTypeOf<KnownCancellation["mutationState"]>().toEqualTypeOf<
      "not_dispatched" | "dispatched_unconfirmed" | "created"
    >()
    expectTypeOf<keyof UnknownCancellation>().not.toEqualTypeOf<
      "mutationState" | "label"
    >()
  })

  it("is the shared contract imported by background and content consumers", () => {
    const consumerPaths = [
      "../../../../src/entrypoints/background/openrouter/managementKeyAction.ts",
      "../../../../src/entrypoints/content/messageHandlers/handlers/openRouterManagementKey.ts",
      "../../../../src/entrypoints/content/messageHandlers/openrouter/managementKeyPage.ts",
    ]

    for (const consumerPath of consumerPaths) {
      const source = readFileSync(
        new URL(consumerPath, import.meta.url),
        "utf8",
      )
      expect(source).not.toContain('from "~/types/tempWindowFetch"')
      expect(source).toContain(
        'from "~/services/apiAdapters/openrouter/managementKeyPageContract"',
      )
    }
  })
})
