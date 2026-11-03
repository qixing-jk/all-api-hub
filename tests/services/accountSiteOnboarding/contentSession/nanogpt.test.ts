import { afterEach, describe, expect, it, vi } from "vitest"

import { nanoGptContentSessionExtractor } from "~/services/accountSiteOnboarding/contentSession/nanogpt"
import { nanoGptBrowserIdentity } from "~/services/apiAdapters/nanogpt/browserIdentity"

const DEPOSIT_ADDRESS = "nano_fixture_deposit_address"

const context = {
  url: "https://nano-gpt.com/invitations",
  siteTypeHint: "nanogpt" as const,
}

const sessionBody = {
  user: {
    id: "00000000-0000-4000-8000-0000000000a1",
    name: "Example User",
    email: "example@example.invalid",
    clientSession: "924452",
  },
  expires: "2026-11-23T18:57:32.962Z",
}
const localSessionBody = {
  data: { id: "924452", nanoDepositAddress: DEPOSIT_ADDRESS },
}

const stubConsoleSession = (
  session: unknown = sessionBody,
  localSession: unknown = localSessionBody,
) =>
  vi.fn((input: string) =>
    Promise.resolve({
      ok: true,
      json: async () =>
        input.includes("/api/auth/local-session") ? localSession : session,
    }),
  )

afterEach(() => vi.unstubAllGlobals())

describe("NanoGPT content session extraction", () => {
  it("rejects mismatched console and local client session identities", async () => {
    vi.stubGlobal(
      "fetch",
      stubConsoleSession(sessionBody, {
        data: { ...localSessionBody.data, id: "different" },
      }),
    )
    await expect(
      nanoGptContentSessionExtractor.extract(context),
    ).resolves.toBeNull()
  })
  it("keeps email-only signed-in sessions and rejects malformed local bodies", async () => {
    vi.stubGlobal(
      "fetch",
      stubConsoleSession({
        user: { id: "id", email: "fixture@example.invalid" },
      }),
    )
    expect(await nanoGptContentSessionExtractor.extract(context)).toMatchObject(
      { userId: DEPOSIT_ADDRESS },
    )
    vi.stubGlobal("fetch", stubConsoleSession(sessionBody, null))
    await expect(
      nanoGptContentSessionExtractor.extract(context),
    ).resolves.toBeNull()
  })
  it.each([null, { user: null }, { user: { id: 3 } }])(
    "does not trust malformed session identities: %j",
    async (session) => {
      vi.stubGlobal("fetch", stubConsoleSession(session))
      await expect(
        nanoGptContentSessionExtractor.extract(context),
      ).resolves.toBeNull()
    },
  )
  it("rejects unsuccessful HTTP session responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }))
    await expect(
      nanoGptContentSessionExtractor.extract(context),
    ).resolves.toBeNull()
  })
  it("only claims the console origin for this site type", () => {
    for (const url of [
      "https://api.nano-gpt.com/",
      "https://docs.nano-gpt.com/",
      "https://www.nano-gpt.com/",
      "invalid",
      undefined,
    ]) {
      expect(
        nanoGptContentSessionExtractor.canExtract({ ...context, url }),
      ).toBe(false)
    }
    expect(
      nanoGptContentSessionExtractor.canExtract({
        ...context,
        siteTypeHint: "new-api",
      }),
    ).toBe(false)
    expect(nanoGptContentSessionExtractor.canExtract(context)).toBe(true)
  })

  it("reads the console session with cookies and returns the key-provable identity", async () => {
    const fetchMock = stubConsoleSession()
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      nanoGptContentSessionExtractor.extract(context),
    ).resolves.toEqual({
      // The saved key proves the deposit address, so that is the account id;
      // the console UUID stays an account fact.
      userId: DEPOSIT_ADDRESS,
      user: {
        id: "00000000-0000-4000-8000-0000000000a1",
        username: "Example User",
        email: "example@example.invalid",
        nanoDepositAddress: DEPOSIT_ADDRESS,
      },
      siteTypeHint: "nanogpt",
    })

    expect(fetchMock).toHaveBeenCalledWith(
      "https://nano-gpt.com/api/auth/session",
      { credentials: "include", cache: "no-store" },
    )
    expect(fetchMock).toHaveBeenCalledWith(
      "https://nano-gpt.com/api/auth/local-session",
      { credentials: "include", cache: "no-store" },
    )
  })

  it("falls back to the e-mail when the console exposes no display name", async () => {
    vi.stubGlobal(
      "fetch",
      stubConsoleSession({
        user: { ...sessionBody.user, name: undefined },
      }),
    )

    const extracted = await nanoGptContentSessionExtractor.extract(context)

    expect(extracted?.user.username).toBe("example@example.invalid")
  })

  it("leaves identity unconfirmed for signed-out or malformed sessions", async () => {
    await expect(
      (async () => {
        vi.stubGlobal("fetch", stubConsoleSession({}, localSessionBody))
        return nanoGptContentSessionExtractor.extract(context)
      })(),
    ).resolves.toBeNull()

    for (const [session, local] of [
      [sessionBody, {}],
      [sessionBody, { data: { id: "1" } }],
      [sessionBody, { data: { nanoDepositAddress: "  " } }],
      [{ user: { id: "" } }, localSessionBody],
    ] as const) {
      vi.stubGlobal("fetch", stubConsoleSession(session, local))
      expect(await nanoGptContentSessionExtractor.extract(context)).toBeNull()
    }
  })

  it("fails closed on network or JSON errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
    expect(await nanoGptContentSessionExtractor.extract(context)).toBeNull()

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error("invalid JSON")
        },
      }),
    )
    expect(await nanoGptContentSessionExtractor.extract(context)).toBeNull()
  })
})

describe("NanoGPT browser identity", () => {
  it.each([null, { data: null }, { data: { nanoDepositAddress: " " } }])(
    "keeps malformed local identity unconfirmed: %j",
    async (body) => {
      vi.stubGlobal("document", { cookie: "" })
      const observation = nanoGptBrowserIdentity.observe({
        origin: "https://nano-gpt.com",
        siteType: "nanogpt",
        candidateUserIds: [],
      })!
      await expect(
        observation.verify(vi.fn().mockResolvedValue(body)),
      ).resolves.toBeNull()
    },
  )
  it("only observes the console origin", () => {
    const observationContext = {
      origin: "https://nano-gpt.com",
      siteType: "nanogpt" as const,
      candidateUserIds: [DEPOSIT_ADDRESS],
    }
    expect(nanoGptBrowserIdentity.canObserve(observationContext)).toBe(true)
    expect(
      nanoGptBrowserIdentity.canObserve({
        ...observationContext,
        origin: "https://api.nano-gpt.com",
      }),
    ).toBe(false)
  })

  it("verifies the account through the local session it is given", async () => {
    vi.stubGlobal("document", { cookie: "" })
    const observation = nanoGptBrowserIdentity.observe({
      origin: "https://nano-gpt.com",
      siteType: "nanogpt",
      candidateUserIds: [DEPOSIT_ADDRESS],
    })!
    const read = vi.fn().mockResolvedValue(localSessionBody)

    await expect(observation.verify(read)).resolves.toBe(DEPOSIT_ADDRESS)
    expect(read).toHaveBeenCalledWith({
      url: "https://nano-gpt.com/api/auth/local-session",
    })

    read.mockResolvedValue({ data: {} })
    await expect(observation.verify(read)).resolves.toBeNull()
  })
})
