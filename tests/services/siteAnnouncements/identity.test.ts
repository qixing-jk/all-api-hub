import { describe, expect, it } from "vitest"

import {
  compareIdentityEntriesOldestFirst,
  digestAnnouncementFingerprint,
  pruneIdentityLedger,
} from "~/services/siteAnnouncements/identity"
import type { SiteAnnouncementIdentityEntry } from "~/services/siteAnnouncements/identity"
import type { SiteAnnouncementStoreState } from "~/types/siteAnnouncements"

describe("site announcement identities", () => {
  it("uses lowercase SHA-256 over UTF-8 fingerprints", async () => {
    await expect(digestAnnouncementFingerprint("abc")).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    )
  })

  it("encodes non-ASCII fingerprints as UTF-8", async () => {
    await expect(digestAnnouncementFingerprint("站点公告🚀")).resolves.toBe(
      "1fb81783e25e03155054de64e19b0e0d7419fe72575c0881834e012d75cca52f",
    )
  })

  it("breaks equal timestamps by site key and digest", () => {
    const entries: SiteAnnouncementIdentityEntry[] = [
      {
        siteKey: "site-b",
        digest: "a",
        marker: { firstSeenAt: 1, lastSeenAt: 5 },
      },
      {
        siteKey: "site-a",
        digest: "b",
        marker: { firstSeenAt: 1, lastSeenAt: 5 },
      },
      {
        siteKey: "site-a",
        digest: "a",
        marker: { firstSeenAt: 1, lastSeenAt: 5 },
      },
    ]
    expect(
      entries
        .sort(compareIdentityEntriesOldestFirst)
        .map(({ siteKey, digest }) => `${siteKey}:${digest}`),
    ).toEqual(["site-a:a", "site-a:b", "site-b:a"])
  })

  it("uses ordinal ordering for non-ASCII tie-break values", () => {
    const entries: SiteAnnouncementIdentityEntry[] = [
      {
        siteKey: "site-ä",
        digest: "a",
        marker: { firstSeenAt: 1, lastSeenAt: 5 },
      },
      {
        siteKey: "site-z",
        digest: "a",
        marker: { firstSeenAt: 1, lastSeenAt: 5 },
      },
    ]

    expect(
      entries
        .sort(compareIdentityEntriesOldestFirst)
        .map(({ siteKey }) => siteKey),
    ).toEqual(["site-z", "site-ä"])
  })

  it("prunes per-site and global identities deterministically and idempotently", () => {
    const ledger: SiteAnnouncementStoreState["identityLedger"] = {
      "site-a": {
        ["a".repeat(64)]: { firstSeenAt: 1, lastSeenAt: 10 },
        ["b".repeat(64)]: { firstSeenAt: 1, lastSeenAt: 10 },
        ["c".repeat(64)]: { firstSeenAt: 1, lastSeenAt: 10 },
      },
      "site-b": {
        ["d".repeat(64)]: { firstSeenAt: 1, lastSeenAt: 10 },
        ["e".repeat(64)]: { firstSeenAt: 1, lastSeenAt: 10 },
      },
      "site-c": {
        ["f".repeat(64)]: { firstSeenAt: 1, lastSeenAt: 10 },
      },
    }

    const pruned = pruneIdentityLedger(ledger, {
      identitiesPerSite: 2,
      identitiesTotal: 3,
    })

    expect(pruned).toEqual({
      "site-b": {
        ["d".repeat(64)]: { firstSeenAt: 1, lastSeenAt: 10 },
        ["e".repeat(64)]: { firstSeenAt: 1, lastSeenAt: 10 },
      },
      "site-c": {
        ["f".repeat(64)]: { firstSeenAt: 1, lastSeenAt: 10 },
      },
    })
    expect(
      pruneIdentityLedger(pruned, {
        identitiesPerSite: 2,
        identitiesTotal: 3,
      }),
    ).toEqual(pruned)
    expect(ledger["site-a"]).toHaveProperty("a".repeat(64))
  })
})
