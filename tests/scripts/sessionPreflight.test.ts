import type { Page } from "@playwright/test"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  preflightSession,
  probePageSession,
  type SessionProbe,
} from "~~/scripts/cdp/session-preflight.mjs"

const authenticated: SessionProbe = { status: "authenticated", identity: "42" }
const signedOut: SessionProbe = { status: "unauthenticated" }
const failed: SessionProbe = { status: "error", reason: "request-failed" }

describe("live session preflight", () => {
  it.each([
    undefined,
    { status: "unknown" },
    { status: "authenticated", identity: "" },
  ])(
    "rejects incomplete target evidence instead of requesting login: %j",
    async (target) => {
      expect(
        (
          await preflightSession({
            probeTarget: async () => target as SessionProbe,
            sourceDiscoveryComplete: true,
          })
        ).status,
      ).toBe("probe-failed")
    },
  )

  it("projects probe evidence without retaining extra credential fields", async () => {
    const result = await preflightSession({
      probeTarget: async () => ({ ...authenticated, token: "secret" }),
    })
    expect(result.target).toEqual(authenticated)
    expect(JSON.stringify(result)).not.toContain("secret")
  })

  it("reuses the authenticated target without inspecting source credentials", async () => {
    const probe = vi.fn()
    const checkTransfer = vi.fn()
    const result = await preflightSession({
      probeTarget: async () => authenticated,
      sources: [{ name: "daily", probe, checkTransfer }],
    })
    expect(result).toMatchObject({ status: "ready", target: authenticated })
    expect(probe).not.toHaveBeenCalled()
    expect(checkTransfer).not.toHaveBeenCalled()
  })

  it("does not turn an unauthenticated target into a manual-login requirement", async () => {
    expect(
      await preflightSession({ probeTarget: async () => signedOut }),
    ).toMatchObject({ status: "source-check-required", target: signedOut })
  })

  it.each([failed, authenticated])(
    "stops on a target error or identity mismatch: %j",
    async (target) => {
      const probe = vi.fn()
      const result = await preflightSession({
        probeTarget: async () => target,
        expectedIdentity: "different-account",
        sources: [{ name: "daily", probe }],
      })
      expect(result.status).toBe(
        target.status === "error" ? "probe-failed" : "identity-mismatch",
      )
      expect(probe).not.toHaveBeenCalled()
    },
  )

  it("reports sync availability only after live source identity and transfer checks", async () => {
    const checkTransfer = vi.fn(async () => "available" as const)
    expect(
      await preflightSession({
        probeTarget: async () => signedOut,
        expectedIdentity: "42",
        sources: [
          { name: "daily", probe: async () => authenticated, checkTransfer },
        ],
      }),
    ).toMatchObject({
      status: "sync-available",
      sources: [
        { name: "daily", session: authenticated, transfer: "available" },
      ],
    })
    expect(checkTransfer).toHaveBeenCalledOnce()
  })

  it("does not use a source belonging to a different account", async () => {
    const checkTransfer = vi.fn()
    const result = await preflightSession({
      probeTarget: async () => signedOut,
      expectedIdentity: "different-account",
      sources: [
        { name: "daily", probe: async () => authenticated, checkTransfer },
      ],
      sourceDiscoveryComplete: true,
    })
    expect(result.status).toBe("identity-mismatch")
    expect(checkTransfer).not.toHaveBeenCalled()
  })

  it.each([undefined, async () => "unchecked" as const])(
    "keeps missing transfer evidence pending",
    async (checkTransfer) => {
      expect(
        (
          await preflightSession({
            probeTarget: async () => signedOut,
            sources: [
              {
                name: "daily",
                probe: async () => authenticated,
                checkTransfer,
              },
            ],
            sourceDiscoveryComplete: true,
          })
        ).status,
      ).toBe("source-check-required")
    },
  )

  it("does not conclude manual login while another source is uninspected", async () => {
    expect(
      (
        await preflightSession({
          probeTarget: async () => signedOut,
          sources: [{ name: "daily", probe: async () => signedOut }],
        })
      ).status,
    ).toBe("source-check-required")
  })

  it("allows manual login after all authorized sources are confirmed signed out", async () => {
    expect(
      (
        await preflightSession({
          probeTarget: async () => signedOut,
          sources: [{ name: "daily", probe: async () => signedOut }],
          sourceDiscoveryComplete: true,
        })
      ).status,
    ).toBe("manual-login-required")
  })

  it("allows manual login after all applicable transfer methods are unavailable", async () => {
    expect(
      (
        await preflightSession({
          probeTarget: async () => signedOut,
          sources: [
            {
              name: "daily",
              probe: async () => authenticated,
              checkTransfer: async () => "unavailable",
            },
          ],
          sourceDiscoveryComplete: true,
        })
      ).status,
    ).toBe("manual-login-required")
  })

  it("continues to a usable source after another source fails", async () => {
    expect(
      (
        await preflightSession({
          probeTarget: async () => signedOut,
          sources: [
            { name: "unreachable", probe: async () => failed },
            {
              name: "daily",
              probe: async () => authenticated,
              checkTransfer: async () => "available",
            },
          ],
        })
      ).status,
    ).toBe("sync-available")
  })

  it("keeps source probe failures distinct from manual login", async () => {
    expect(
      (
        await preflightSession({
          probeTarget: async () => signedOut,
          sources: [{ name: "daily", probe: async () => failed }],
          sourceDiscoveryComplete: true,
        })
      ).status,
    ).toBe("probe-failed")
  })

  it("does not expose credentials from a thrown source error", async () => {
    const result = await preflightSession({
      probeTarget: async () => signedOut,
      sources: [
        {
          name: "daily",
          probe: async () => {
            throw new Error("token=secret")
          },
        },
      ],
      sourceDiscoveryComplete: true,
    })
    expect(result.status).toBe("probe-failed")
    expect(JSON.stringify(result)).not.toContain("secret")
  })

  it("does not treat a failed cookie-capability call as exhausted recovery", async () => {
    expect(
      (
        await preflightSession({
          probeTarget: async () => signedOut,
          sources: [
            {
              name: "daily",
              probe: async () => authenticated,
              checkTransfer: async () => {
                throw new Error("bridge unavailable")
              },
            },
          ],
          sourceDiscoveryComplete: true,
        })
      ).status,
    ).toBe("source-check-required")
  })
})

describe("page identity probe", () => {
  // Execute the actual browser callback with controlled HTTP responses.
  const page = {
    evaluate: (callback: (arg: unknown) => unknown, arg: unknown) =>
      callback(arg),
  } as unknown as Page
  const readIdentity = (body: unknown) =>
    (body as { user?: { id?: string } }).user?.id
  const probe = () =>
    probePageSession(page, { endpoint: "/api/me", readIdentity })
  afterEach(() => vi.unstubAllGlobals())

  function response(status: number, body: string) {
    vi.stubGlobal("location", new URL("https://site.example/dashboard"))
    const fetch = vi.fn(async () => new Response(body, { status }))
    vi.stubGlobal("fetch", fetch)
    return fetch
  }

  it("returns only identity and uses the page's session for a bounded read", async () => {
    const fetch = response(
      200,
      JSON.stringify({ user: { id: "42" }, token: "secret" }),
    )
    expect(await probe()).toEqual(authenticated)
    expect(fetch).toHaveBeenCalledWith(
      "https://site.example/api/me",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
        cache: "no-store",
        redirect: "error",
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it("recognizes an explicit 401 without requiring JSON", async () => {
    response(401, "Unauthorized")
    expect(await probe()).toEqual(signedOut)
  })

  it.each([403, 429, 500])(
    "keeps HTTP %s separate from a missing login",
    async (status) => {
      response(status, "token=secret")
      expect(await probe()).toEqual({
        status: "error",
        reason: `http-${status}`,
      })
    },
  )

  it.each(["<html>challenge</html>", "{}", '{"user":{"id":""}}'])(
    "rejects an unverified identity response: %s",
    async (body) => {
      response(200, body)
      expect((await probe()).status).toBe("error")
    },
  )

  it("does not send credentials to a cross-origin identity URL", async () => {
    const fetch = response(200, "{}")
    expect(
      await probePageSession(page, {
        endpoint: "https://other.example/me",
        readIdentity,
      }),
    ).toEqual({ status: "error", reason: "cross-origin-endpoint" })
    expect(fetch).not.toHaveBeenCalled()
  })

  it("sanitizes transport errors", async () => {
    response(200, "{}").mockRejectedValue(new Error("token=secret"))
    expect(await probe()).toEqual(failed)
  })
})
