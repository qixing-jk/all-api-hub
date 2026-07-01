import { describe, expect, it } from "vitest"

import {
  buildBookmarkAccountImportCandidates,
  summarizeBookmarkAccountImportScan,
} from "~/features/AccountManagement/bookmarkImport/candidates"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

describe("bookmark account import candidates", () => {
  it("flattens bookmark trees, keeps web URLs, rejects malformed and non-web URLs, and dedupes origins", () => {
    const result = buildBookmarkAccountImportCandidates({
      bookmarkTree: [
        {
          id: "root",
          title: "Root",
          children: [
            {
              id: "folder-1",
              title: "Folder",
              children: [
                {
                  id: "ready-1",
                  title: "Ready",
                  url: "https://alpha.example.invalid/dashboard",
                },
                {
                  id: "ready-duplicate",
                  title: "Duplicate bookmark",
                  url: "https://alpha.example.invalid/settings",
                },
                {
                  id: "non-web",
                  title: "Mail",
                  url: "mailto:owner@example.invalid",
                },
                {
                  id: "malformed",
                  title: "Broken",
                  url: "https://",
                },
              ],
            },
          ],
        },
      ],
      existingAccounts: [],
    })

    expect(result.candidates).toEqual([
      {
        id: "bookmark-import:https://alpha.example.invalid",
        url: "https://alpha.example.invalid",
        normalizedOrigin: "https://alpha.example.invalid",
        status: "ready",
        selectedByDefault: true,
        sourceBookmarkCount: 2,
      },
    ])
    expect(result.ignoredCounts).toEqual({
      folder: 2,
      malformed: 1,
      nonWeb: 1,
      repeatedOrigin: 1,
      unsupported: 0,
    })
  })

  it("marks existing origins as duplicates while keeping them available for explicit override", () => {
    const result = buildBookmarkAccountImportCandidates({
      bookmarkTree: [
        {
          id: "root",
          title: "Root",
          children: [
            {
              id: "existing",
              title: "Existing",
              url: "https://existing.example.invalid/path",
            },
            {
              id: "new",
              title: "New",
              url: "https://new.example.invalid/path",
            },
          ],
        },
      ],
      existingAccounts: [
        buildSiteAccount({
          id: "account-existing",
          site_url: "https://existing.example.invalid/dashboard",
        }),
      ],
    })

    expect(result.candidates).toEqual([
      {
        id: "bookmark-import:https://existing.example.invalid",
        url: "https://existing.example.invalid",
        normalizedOrigin: "https://existing.example.invalid",
        status: "duplicate",
        selectedByDefault: false,
        sourceBookmarkCount: 1,
        existingAccountCount: 1,
      },
      {
        id: "bookmark-import:https://new.example.invalid",
        url: "https://new.example.invalid",
        normalizedOrigin: "https://new.example.invalid",
        status: "ready",
        selectedByDefault: true,
        sourceBookmarkCount: 1,
      },
    ])
    expect(summarizeBookmarkAccountImportScan(result)).toEqual({
      candidateCount: 2,
      readyCount: 1,
      duplicateCount: 1,
      invalidCount: 0,
      ignoredCount: 1,
      selectedDefaultCount: 1,
    })
  })

  it("counts empty bookmark folders as ignored folders", () => {
    const result = buildBookmarkAccountImportCandidates({
      bookmarkTree: [
        {
          id: "root",
          title: "Root",
          children: [
            {
              id: "empty-folder",
              title: "Empty folder",
              children: [],
            },
          ],
        },
      ],
      existingAccounts: [],
    })

    expect(result.ignoredCounts.folder).toBe(2)
  })

  it("summarizes malformed, non-web, and unsupported ignored inputs as invalid", () => {
    expect(
      summarizeBookmarkAccountImportScan({
        candidates: [],
        ignoredCounts: {
          folder: 1,
          malformed: 2,
          nonWeb: 3,
          repeatedOrigin: 4,
          unsupported: 5,
        },
      }),
    ).toEqual({
      candidateCount: 0,
      readyCount: 0,
      duplicateCount: 0,
      invalidCount: 10,
      ignoredCount: 15,
      selectedDefaultCount: 0,
    })
  })
})
