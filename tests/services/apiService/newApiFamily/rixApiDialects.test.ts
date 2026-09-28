import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  clearRixApiDialectChoicesForTests,
  resolveRixApiDialect,
  RIX_API_DIALECT_KEYS,
} from "~/services/apiService/newApiFamily/variants/rixApiDialects"

const baseUrl = "https://rix.example.invalid"

const resolveTokenGroups = (
  attempt: (candidate: string) => Promise<string>,
  url = baseUrl,
) =>
  resolveRixApiDialect(
    url,
    RIX_API_DIALECT_KEYS.TokenGroups,
    ["token-group", "new-api-path"],
    attempt,
  )

describe("Rix API dialect memory", () => {
  beforeEach(() => {
    clearRixApiDialectChoicesForTests()
  })

  it("returns the first candidate that answers and remembers it", async () => {
    const attempt = vi
      .fn<(candidate: string) => Promise<string>>()
      .mockResolvedValue("groups")

    await expect(resolveTokenGroups(attempt)).resolves.toBe("groups")
    expect(attempt).toHaveBeenCalledTimes(1)
    expect(attempt).toHaveBeenCalledWith("token-group")

    // A second read starts from the remembered candidate instead of probing again.
    await expect(resolveTokenGroups(attempt)).resolves.toBe("groups")
    expect(attempt).toHaveBeenCalledTimes(2)
    expect(attempt).toHaveBeenLastCalledWith("token-group")
  })

  it("tries the next candidate when the preferred one does not answer", async () => {
    const attempt = vi
      .fn<(candidate: string) => Promise<string>>()
      .mockImplementation(async (candidate) => {
        if (candidate === "token-group") throw new Error("not found")
        return "legacy-groups"
      })

    await expect(resolveTokenGroups(attempt)).resolves.toBe("legacy-groups")

    // The fallback is the remembered choice, so the 404 path is not repeated.
    await expect(resolveTokenGroups(attempt)).resolves.toBe("legacy-groups")
    expect(attempt.mock.calls.map(([candidate]) => candidate)).toEqual([
      "token-group",
      "new-api-path",
      "new-api-path",
    ])
  })

  it("re-probes the other candidates when the remembered one stops answering", async () => {
    const legacyFirst = vi
      .fn<(candidate: string) => Promise<string>>()
      .mockImplementation(async (candidate) => {
        if (candidate === "token-group") throw new Error("not found")
        return "legacy-groups"
      })
    await resolveTokenGroups(legacyFirst)

    const recovered = vi
      .fn<(candidate: string) => Promise<string>>()
      .mockImplementation(async (candidate) => {
        if (candidate === "new-api-path") throw new Error("not found")
        return "token-group-groups"
      })

    await expect(resolveTokenGroups(recovered)).resolves.toBe(
      "token-group-groups",
    )
    expect(recovered.mock.calls.map(([candidate]) => candidate)).toEqual([
      "new-api-path",
      "token-group",
    ])

    // The replacement is remembered from then on.
    const settled = vi
      .fn<(candidate: string) => Promise<string>>()
      .mockResolvedValue("token-group-groups")
    await resolveTokenGroups(settled)
    expect(settled).toHaveBeenCalledTimes(1)
    expect(settled).toHaveBeenCalledWith("token-group")
  })

  it("keeps one memory per deployment", async () => {
    const otherAttempt = vi
      .fn<(candidate: string) => Promise<string>>()
      .mockResolvedValue("groups")

    await resolveTokenGroups(
      vi
        .fn<(candidate: string) => Promise<string>>()
        .mockImplementation(async (candidate) => {
          if (candidate === "token-group") throw new Error("not found")
          return "legacy-groups"
        }),
    )
    await resolveTokenGroups(otherAttempt, "https://other.example.invalid")

    expect(otherAttempt).toHaveBeenCalledWith("token-group")
  })

  it("keys the memory on the normalized deployment URL", async () => {
    const rememberFallback = vi
      .fn<(candidate: string) => Promise<string>>()
      .mockImplementation(async (candidate) => {
        if (candidate === "token-group") throw new Error("not found")
        return "legacy-groups"
      })
    await resolveTokenGroups(rememberFallback)

    const sameDeployment = vi
      .fn<(candidate: string) => Promise<string>>()
      .mockResolvedValue("legacy-groups")
    await resolveTokenGroups(sameDeployment, "https://rix.example.invalid/")

    expect(sameDeployment).toHaveBeenCalledWith("new-api-path")
  })

  it("keeps the dialects of one deployment independent", async () => {
    const groups = vi
      .fn<(candidate: string) => Promise<string>>()
      .mockImplementation(async (candidate) => {
        if (candidate === "token-group") throw new Error("not found")
        return "legacy-groups"
      })
    await resolveTokenGroups(groups)

    const pricing = vi
      .fn<(candidate: string) => Promise<string>>()
      .mockResolvedValue("credential-pricing")
    await resolveRixApiDialect(
      baseUrl,
      RIX_API_DIALECT_KEYS.PricingAuth,
      ["credential", "anonymous"],
      pricing,
    )

    expect(pricing).toHaveBeenCalledTimes(1)
    expect(pricing).toHaveBeenCalledWith("credential")
  })

  it("surfaces the last failure when no candidate answers", async () => {
    const failure = new Error("both endpoints gone")
    const attempt = vi
      .fn<(candidate: string) => Promise<string>>()
      .mockRejectedValue(failure)

    await expect(resolveTokenGroups(attempt)).rejects.toBe(failure)
  })

  it("evicts the oldest deployment entry when cache exceeds maximum size", async () => {
    for (let i = 0; i < 100; i++) {
      const attempt = vi
        .fn<(candidate: string) => Promise<string>>()
        .mockResolvedValue(`res-${i}`)
      await resolveTokenGroups(attempt, `https://deploy-${i}.example.invalid`)
    }

    const attempt100 = vi
      .fn<(candidate: string) => Promise<string>>()
      .mockResolvedValue("res-100")
    await resolveTokenGroups(attempt100, "https://deploy-100.example.invalid")

    const reprobeAttempt = vi
      .fn<(candidate: string) => Promise<string>>()
      .mockResolvedValue("reprobe")
    await resolveTokenGroups(reprobeAttempt, "https://deploy-0.example.invalid")
    expect(reprobeAttempt).toHaveBeenCalledWith("token-group")
  })
})
