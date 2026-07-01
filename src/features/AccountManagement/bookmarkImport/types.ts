import type { AccountSiteType } from "~/constants/siteType"
import type { BrowserBookmarkTreeNode } from "~/utils/browser/browserApi"

export type BookmarkAccountImportCandidateStatus = "ready" | "duplicate"

export interface BookmarkAccountImportCandidate {
  id: string
  url: string
  normalizedOrigin: string
  status: BookmarkAccountImportCandidateStatus
  selectedByDefault: boolean
  sourceBookmarkCount: number
  existingAccountCount?: number
  detectedSiteType?: AccountSiteType
}

export interface BookmarkAccountImportIgnoredCounts {
  folder: number
  malformed: number
  nonWeb: number
  repeatedOrigin: number
  unsupported: number
}

export interface BookmarkAccountImportScanResult {
  candidates: BookmarkAccountImportCandidate[]
  ignoredCounts: BookmarkAccountImportIgnoredCounts
}

export interface BookmarkAccountImportScanSummary {
  candidateCount: number
  readyCount: number
  duplicateCount: number
  invalidCount: number
  ignoredCount: number
  selectedDefaultCount: number
}

export type NativeBookmarkTreeNode = Pick<
  BrowserBookmarkTreeNode,
  "id" | "title" | "url" | "children"
>

export type BookmarkAccountImportFailureCategory =
  | "detection"
  | "save"
  | "unknown"

export type BookmarkAccountImportFailureMessageKey =
  `ui:dialog.bookmarkAccountImport.failures.${BookmarkAccountImportFailureCategory}`

export interface BookmarkAccountImportProgress {
  completedCount: number
  totalCount: number
  currentCandidateId: string
}

export type BookmarkAccountImportRowResult =
  | {
      candidateId: string
      url: string
      status: "success"
      accountId: string | null
      failureCategory?: undefined
    }
  | {
      candidateId: string
      url: string
      status: "failed"
      failureCategory: BookmarkAccountImportFailureCategory
      safeMessageKey: BookmarkAccountImportFailureMessageKey
    }

export interface BookmarkAccountImportRunResult {
  rows: BookmarkAccountImportRowResult[]
  successCount: number
  failureCount: number
  skippedCount: number
}
