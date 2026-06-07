import { PRODUCT_ANNOUNCEMENT_SEVERITIES } from "./constants"

type ValueOf<T> = T[keyof T]

export type ProductAnnouncementSeverity = ValueOf<
  typeof PRODUCT_ANNOUNCEMENT_SEVERITIES
>

export interface RawProductAnnouncementCta {
  label?: unknown
  url?: unknown
}

export interface RawProductAnnouncementFeed {
  schemaVersion?: unknown
  defaultLocale?: unknown
  announcements?: unknown
  _examples?: {
    devAnnouncements?: unknown
  }
}

export interface ProductAnnouncementCta {
  label: string
  url: string
}

export interface ProductAnnouncement {
  id: string
  revision: number
  severity: ProductAnnouncementSeverity
  priority: number
  startsAt: number
  expiresAt: number
  title: string
  message: string
  cta?: ProductAnnouncementCta
  dismissed: boolean
  seen: boolean
}

export interface ProductAnnouncementState {
  schemaVersion: 1
  lastFetchedAt?: number
  cachedFeed?: RawProductAnnouncementFeed
  dismissed: Record<string, number>
  seenAt: Record<string, number>
  lastShownAt: Record<string, number>
}
