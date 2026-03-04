import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RateLimiter } from "~/services/models/modelSync/rateLimiter"

describe("RateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("constructor", () => {
    it("creates limiter with valid params", () => {
      const limiter = new RateLimiter(60, 10)
      expect(limiter.getTokens()).toBe(10)
    })

    it("throws on invalid requestsPerMinute", () => {
      expect(() => new RateLimiter(0, 10)).toThrow()
      expect(() => new RateLimiter(-1, 10)).toThrow()
    })

    it("throws on invalid burst", () => {
      expect(() => new RateLimiter(60, 0)).toThrow()
      expect(() => new RateLimiter(60, -1)).toThrow()
    })
  })

  describe("tryAcquire", () => {
    it("acquires token when available", () => {
      const limiter = new RateLimiter(60, 5)
      expect(limiter.tryAcquire()).toBe(true)
      expect(limiter.getTokens()).toBe(4)
    })

    it("fails when no tokens available", () => {
      const limiter = new RateLimiter(60, 1)
      limiter.tryAcquire()
      expect(limiter.tryAcquire()).toBe(false)
    })
  })

  describe("acquire", () => {
    it("acquires token immediately when available", async () => {
      const limiter = new RateLimiter(60, 5)
      await limiter.acquire()
      expect(limiter.getTokens()).toBe(4)
    })

    it("waits when no tokens available", async () => {
      const limiter = new RateLimiter(60, 1)
      limiter.tryAcquire()

      const promise = limiter.acquire()
      vi.advanceTimersByTime(1000)
      await expect(promise).resolves.toBeUndefined()

      expect(limiter.getTokens()).toBeLessThan(1)
    })
  })

  describe("reset", () => {
    it("resets tokens to capacity", () => {
      const limiter = new RateLimiter(60, 5)
      limiter.tryAcquire()
      limiter.tryAcquire()
      limiter.reset()
      expect(limiter.getTokens()).toBe(5)
    })
  })

  describe("refill", () => {
    it("refills tokens over time", () => {
      const limiter = new RateLimiter(60, 5)
      limiter.tryAcquire()
      limiter.tryAcquire()

      vi.advanceTimersByTime(2000)
      expect(limiter.getTokens()).toBeGreaterThan(3)
    })
  })
})
