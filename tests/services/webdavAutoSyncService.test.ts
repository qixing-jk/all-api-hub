import { describe, expect, it } from "vitest"

import { normalizeWebdavOrderedEntryIds } from "~/services/webdav/webdavSelectiveSync"

describe("normalizeWebdavOrderedEntryIds", () => {
  it("filters invalid ids, de-dupes, and appends missing entries stably", () => {
    const accounts = [
      { id: "a1", created_at: 10 } as any,
      { id: "a2", created_at: 20 } as any,
    ]
    const bookmarks = [
      { id: "b1", created_at: 30 } as any,
      { id: "b2", created_at: 40 } as any,
    ]

    const entryIdSet = new Set(["a1", "a2", "b1", "b2"])

    const ordered = normalizeWebdavOrderedEntryIds({
      baseOrderedIds: ["b2", "b2", "missing", "a2"],
      entryIdSet,
      accounts,
      bookmarks,
    })

    expect(ordered).toEqual(["b2", "a2", "a1", "b1"])
  })
})
