import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { extractContentSession } from "~/services/accountSiteOnboarding/contentSession/extraction"
import { ContentSessionProtocolError } from "~/services/accountSiteOnboarding/contracts"
import type {
  ContentSessionExtractionContext,
  ContentSessionExtractionResult,
  ContentSessionExtractor,
} from "~/services/accountSiteOnboarding/contracts"
import type { AccountDetectionDiagnostics } from "~/services/accountSiteOnboarding/diagnostics"

const { mockGetContentSessionExtractors } = vi.hoisted(() => ({
  mockGetContentSessionExtractors: vi.fn(),
}))

vi.mock("~/services/accountSiteOnboarding/registry", () => ({
  getContentSessionExtractors: mockGetContentSessionExtractors,
}))

const session: ContentSessionExtractionResult = {
  userId: 7,
  user: { id: 7, username: "example" },
  accessToken: "sensitive-access-token",
}

const context = (
  overrides: Partial<ContentSessionExtractionContext> = {},
): ContentSessionExtractionContext => ({
  url: "https://panel.example.invalid",
  siteTypeHint: SITE_TYPES.UNKNOWN,
  ...overrides,
})

const extractor = (
  id: string,
  overrides: Partial<ContentSessionExtractor> = {},
): ContentSessionExtractor => ({
  id,
  canExtract: () => false,
  extract: vi.fn().mockResolvedValue(null),
  ...overrides,
})

describe("extractContentSession", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetContentSessionExtractors.mockReturnValue([])
  })

  it("runs one registered probe for an explicitly allowed unknown site without extracting twice", async () => {
    const probe = vi.fn().mockResolvedValue(session)
    const extract = vi.fn().mockResolvedValue(session)
    mockGetContentSessionExtractors.mockReturnValue([
      extractor("new-api", { probe, extract }),
    ])
    const assertOrigin = vi.fn()

    await expect(
      extractContentSession(context({ allowSessionProbe: true }), assertOrigin),
    ).resolves.toBe(session)

    expect(probe).toHaveBeenCalledTimes(1)
    expect(extract).not.toHaveBeenCalled()
    expect(assertOrigin).toHaveBeenCalledTimes(2)
  })

  it.each([
    ["missing", undefined, SITE_TYPES.UNKNOWN],
    ["false", false, SITE_TYPES.UNKNOWN],
    ["known site", true, SITE_TYPES.NEW_API],
  ])(
    "does not probe when permission is %s",
    async (_label, allow, siteType) => {
      const probe = vi.fn().mockResolvedValue(session)
      const candidate = extractor("candidate", { probe })
      mockGetContentSessionExtractors.mockReturnValue([candidate])

      await expect(
        extractContentSession(
          context({
            siteTypeHint: siteType,
            ...(allow === undefined ? {} : { allowSessionProbe: allow }),
          }),
          vi.fn(),
        ),
      ).resolves.toBeNull()

      expect(probe).not.toHaveBeenCalled()
    },
  )

  it("keeps a known extractor error authoritative and does not try later extractors", async () => {
    const knownError = new Error("known protocol failure")
    const first = extractor("known", {
      canExtract: () => true,
      extract: vi.fn().mockRejectedValue(knownError),
      probe: vi.fn().mockResolvedValue(session),
    })
    const later = extractor("later", {
      canExtract: vi.fn(() => true),
      extract: vi.fn().mockResolvedValue(session),
      probe: vi.fn().mockResolvedValue(session),
    })
    mockGetContentSessionExtractors.mockReturnValue([first, later])

    await expect(
      extractContentSession(
        context({ siteTypeHint: SITE_TYPES.NEW_API, allowSessionProbe: true }),
        vi.fn(),
      ),
    ).rejects.toBe(knownError)

    expect(first.extract).toHaveBeenCalledTimes(1)
    expect(first.probe).not.toHaveBeenCalled()
    expect(later.extract).not.toHaveBeenCalled()
    expect(later.probe).not.toHaveBeenCalled()
  })

  it("continues after failed and empty probes until a later candidate succeeds", async () => {
    const firstProbeError = new Error("first probe failed")
    const first = extractor("first", {
      probe: vi.fn().mockRejectedValue(firstProbeError),
    })
    const empty = extractor("empty", {
      probe: vi.fn().mockResolvedValue(null),
    })
    const successful = extractor("successful", {
      probe: vi.fn().mockResolvedValue(session),
      extract: vi.fn().mockResolvedValue(session),
    })
    mockGetContentSessionExtractors.mockReturnValue([first, empty, successful])

    await expect(
      extractContentSession(context({ allowSessionProbe: true }), vi.fn()),
    ).resolves.toBe(session)

    expect(first.probe).toHaveBeenCalledTimes(1)
    expect(empty.probe).toHaveBeenCalledTimes(1)
    expect(successful.probe).toHaveBeenCalledTimes(1)
    expect(successful.extract).not.toHaveBeenCalled()
  })

  it("keeps the first probe error when every probe fails", async () => {
    const firstError = new Error("first candidate failed")
    const secondError = new Error("second candidate failed")
    mockGetContentSessionExtractors.mockReturnValue([
      extractor("first", { probe: vi.fn().mockRejectedValue(firstError) }),
      extractor("second", { probe: vi.fn().mockRejectedValue(secondError) }),
    ])

    await expect(
      extractContentSession(context({ allowSessionProbe: true }), vi.fn()),
    ).rejects.toBe(firstError)
  })

  it("defers a cached fallback registered before protocol probes", async () => {
    const cachedSession = { ...session, user: { id: 7, username: "stale" } }
    const cachedExtract = vi.fn().mockResolvedValue(cachedSession)
    const protocolProbe = vi.fn().mockResolvedValue(session)
    mockGetContentSessionExtractors.mockReturnValue([
      extractor("compatible-user", {
        canExtract: () => true,
        extract: cachedExtract,
        isUnverifiedFallback: true,
      }),
      extractor("protocol", { probe: protocolProbe }),
    ])

    await expect(
      extractContentSession(context({ allowSessionProbe: true }), vi.fn()),
    ).resolves.toBe(session)

    expect(protocolProbe).toHaveBeenCalledTimes(1)
    expect(cachedExtract).not.toHaveBeenCalled()
  })

  it("does not return a cached fallback after a probe error and preserves that error", async () => {
    const probeError = new Error("protocol probe network failure")
    const cachedExtract = vi.fn().mockResolvedValue(session)
    mockGetContentSessionExtractors.mockReturnValue([
      extractor("protocol", { probe: vi.fn().mockRejectedValue(probeError) }),
      extractor("compatible-user", {
        canExtract: () => true,
        extract: cachedExtract,
        isUnverifiedFallback: true,
      }),
    ])

    await expect(
      extractContentSession(context({ allowSessionProbe: true }), vi.fn()),
    ).rejects.toBe(probeError)

    expect(cachedExtract).not.toHaveBeenCalled()
  })

  it("stops on a confirmed protocol error without trying another probe or cached fallback", async () => {
    const protocolError = new ContentSessionProtocolError(
      "confirmed protocol response is invalid",
    )
    const laterProbe = vi.fn().mockResolvedValue(session)
    const cachedExtract = vi.fn().mockResolvedValue(session)
    mockGetContentSessionExtractors.mockReturnValue([
      extractor("confirmed-protocol", {
        probe: vi.fn().mockRejectedValue(protocolError),
      }),
      extractor("later-protocol", { probe: laterProbe }),
      extractor("compatible-user", {
        canExtract: () => true,
        extract: cachedExtract,
        isUnverifiedFallback: true,
      }),
    ])

    await expect(
      extractContentSession(context({ allowSessionProbe: true }), vi.fn()),
    ).rejects.toBe(protocolError)

    expect(laterProbe).not.toHaveBeenCalled()
    expect(cachedExtract).not.toHaveBeenCalled()
  })
  it("falls back to a normal compatible extractor when all probes are empty", async () => {
    const probe = vi.fn().mockResolvedValue(null)
    const compatibleExtract = vi.fn().mockResolvedValue(session)
    mockGetContentSessionExtractors.mockReturnValue([
      extractor("probe", { probe }),
      extractor("compatible-user", {
        canExtract: () => true,
        extract: compatibleExtract,
        isUnverifiedFallback: true,
      }),
    ])

    await expect(
      extractContentSession(context({ allowSessionProbe: true }), vi.fn()),
    ).resolves.toBe(session)

    expect(probe).toHaveBeenCalledTimes(1)
    expect(compatibleExtract).toHaveBeenCalledTimes(1)
  })

  it("checks origin before starting any candidate", async () => {
    const candidate = extractor("candidate", {
      canExtract: vi.fn(() => true),
      extract: vi.fn().mockResolvedValue(session),
    })
    mockGetContentSessionExtractors.mockReturnValue([candidate])
    const changedOrigin = new Error("origin changed")

    await expect(
      extractContentSession(context(), () => {
        throw changedOrigin
      }),
    ).rejects.toBe(changedOrigin)

    expect(candidate.canExtract).not.toHaveBeenCalled()
    expect(candidate.extract).not.toHaveBeenCalled()
  })

  it("rejects an origin change after asynchronous extraction before trying the next candidate", async () => {
    const changedOrigin = new Error("origin changed after extraction")
    const first = extractor("first", {
      canExtract: () => true,
      extract: vi.fn().mockResolvedValue(session),
    })
    const later = extractor("later", {
      canExtract: vi.fn(() => true),
      extract: vi.fn().mockResolvedValue(session),
    })
    mockGetContentSessionExtractors.mockReturnValue([first, later])
    let originChecks = 0

    await expect(
      extractContentSession(context(), () => {
        originChecks += 1
        if (originChecks === 2) throw changedOrigin
      }),
    ).rejects.toBe(changedOrigin)

    expect(first.extract).toHaveBeenCalledTimes(1)
    expect(later.canExtract).not.toHaveBeenCalled()
  })

  it("rejects an origin change after a throwing probe before continuing", async () => {
    const changedOrigin = new Error("origin changed after probe")
    const first = extractor("first", {
      probe: vi.fn().mockRejectedValue(new Error("probe failure")),
    })
    const later = extractor("later", {
      probe: vi.fn().mockResolvedValue(session),
    })
    mockGetContentSessionExtractors.mockReturnValue([first, later])
    let originChecks = 0

    await expect(
      extractContentSession(context({ allowSessionProbe: true }), () => {
        originChecks += 1
        if (originChecks === 2) throw changedOrigin
      }),
    ).rejects.toBe(changedOrigin)

    expect(first.probe).toHaveBeenCalledTimes(1)
    expect(later.probe).not.toHaveBeenCalled()
  })

  it("does not expose session secrets or probe errors through diagnostics", async () => {
    const probeSecret = "private-probe-error"
    const record = vi.fn()
    const finish = vi.fn()
    const diagnostics = {
      requestId: "test-request",
      record,
      finish,
    } satisfies AccountDetectionDiagnostics
    mockGetContentSessionExtractors.mockReturnValue([
      extractor("probe", {
        probe: vi.fn().mockRejectedValue(new Error(probeSecret)),
      }),
      extractor("success", { probe: vi.fn().mockResolvedValue(session) }),
    ])

    await expect(
      extractContentSession(
        context({ allowSessionProbe: true, diagnostics }),
        vi.fn(),
      ),
    ).resolves.toBe(session)

    const diagnosticPayload = JSON.stringify([
      record.mock.calls,
      finish.mock.calls,
    ])
    expect(diagnosticPayload).not.toContain(probeSecret)
    expect(diagnosticPayload).not.toContain("sensitive-access-token")
  })
})
