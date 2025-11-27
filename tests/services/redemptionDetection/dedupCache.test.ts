/**
 * Tests for Redemption Dedup Cache
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RedemptionDedupCache } from "~/services/redemptionDetection/dedupCache"

describe("RedemptionDedupCache", () => {
  let cache: RedemptionDedupCache

  beforeEach(() => {
    vi.useFakeTimers()
    cache = new RedemptionDedupCache()
  })

  afterEach(() => {
    cache.destroy()
    vi.useRealTimers()
  })

  describe("shouldSkip", () => {
    it("should return false for new codes", () => {
      expect(cache.shouldSkip("https://example.com", "abc123")).toBe(false)
    })

    it("should return true for recently seen codes", () => {
      cache.markSeen("https://example.com", "abc123")
      expect(cache.shouldSkip("https://example.com", "abc123")).toBe(true)
    })

    it("should return true for suppressed codes", () => {
      cache.markSuppressed("https://example.com", "abc123")
      expect(cache.shouldSkip("https://example.com", "abc123")).toBe(true)
    })

    it("should return false after TTL expires", () => {
      cache.markSeen("https://example.com", "abc123")
      expect(cache.shouldSkip("https://example.com", "abc123")).toBe(true)

      // Advance time by 11 minutes (TTL is 10 minutes)
      vi.advanceTimersByTime(11 * 60 * 1000)

      expect(cache.shouldSkip("https://example.com", "abc123")).toBe(false)
    })

    it("should differentiate between URLs", () => {
      cache.markSeen("https://example.com/page1", "abc123")
      expect(cache.shouldSkip("https://example.com/page1", "abc123")).toBe(true)
      expect(cache.shouldSkip("https://example.com/page2", "abc123")).toBe(
        false
      )
    })

    it("should differentiate between codes", () => {
      cache.markSeen("https://example.com", "code1")
      expect(cache.shouldSkip("https://example.com", "code1")).toBe(true)
      expect(cache.shouldSkip("https://example.com", "code2")).toBe(false)
    })
  })

  describe("isInCooldown", () => {
    it("should return false initially", () => {
      expect(cache.isInCooldown()).toBe(false)
    })

    it("should return true during cooldown period", () => {
      cache.markSeen("https://example.com", "abc123")
      expect(cache.isInCooldown()).toBe(true)

      // Advance by 3 seconds (within cooldown)
      vi.advanceTimersByTime(3000)
      expect(cache.isInCooldown()).toBe(true)
    })

    it("should return false after cooldown expires", () => {
      cache.markSeen("https://example.com", "abc123")
      expect(cache.isInCooldown()).toBe(true)

      // Advance by 5 seconds (beyond cooldown)
      vi.advanceTimersByTime(5000)
      expect(cache.isInCooldown()).toBe(false)
    })
  })

  describe("cleanup", () => {
    it("should remove expired entries", () => {
      cache.markSeen("https://example.com/1", "code1")
      cache.markSeen("https://example.com/2", "code2")
      cache.markSeen("https://example.com/3", "code3")

      expect(cache.size()).toBe(3)

      // Advance time by 11 minutes (beyond TTL)
      vi.advanceTimersByTime(11 * 60 * 1000)

      cache.cleanup()

      expect(cache.size()).toBe(0)
    })

    it("should keep non-expired entries", () => {
      cache.markSeen("https://example.com/1", "code1")

      // Advance time by 5 minutes (within TTL)
      vi.advanceTimersByTime(5 * 60 * 1000)

      cache.markSeen("https://example.com/2", "code2")

      // Advance time by another 6 minutes (first entry expired, second not)
      vi.advanceTimersByTime(6 * 60 * 1000)

      cache.cleanup()

      expect(cache.size()).toBe(1)
      expect(cache.shouldSkip("https://example.com/1", "code1")).toBe(false)
      expect(cache.shouldSkip("https://example.com/2", "code2")).toBe(true)
    })

    it("should run automatically on timer", () => {
      cache.markSeen("https://example.com", "code1")
      expect(cache.size()).toBe(1)

      // Advance time by 11 minutes (expired)
      vi.advanceTimersByTime(11 * 60 * 1000)

      // Advance cleanup timer (1 minute)
      vi.advanceTimersByTime(1 * 60 * 1000)

      expect(cache.size()).toBe(0)
    })
  })

  describe("markSeen and markSuppressed", () => {
    it("should update entry when marking seen", () => {
      cache.markSeen("https://example.com", "abc123")
      expect(cache.shouldSkip("https://example.com", "abc123")).toBe(true)

      // Advance time to almost expire
      vi.advanceTimersByTime(9.5 * 60 * 1000)

      // Mark seen again (refresh timestamp)
      cache.markSeen("https://example.com", "abc123")

      // Advance another 9 minutes
      vi.advanceTimersByTime(9 * 60 * 1000)

      // Should still be valid (refreshed)
      expect(cache.shouldSkip("https://example.com", "abc123")).toBe(true)
    })

    it("should mark as suppressed", () => {
      cache.markSuppressed("https://example.com", "abc123")
      expect(cache.shouldSkip("https://example.com", "abc123")).toBe(true)

      // Suppressed entries should also expire
      vi.advanceTimersByTime(11 * 60 * 1000)
      expect(cache.shouldSkip("https://example.com", "abc123")).toBe(false)
    })
  })

  describe("destroy", () => {
    it("should clear cache and stop timer", () => {
      cache.markSeen("https://example.com/1", "code1")
      cache.markSeen("https://example.com/2", "code2")

      expect(cache.size()).toBe(2)

      cache.destroy()

      expect(cache.size()).toBe(0)
    })
  })
})
