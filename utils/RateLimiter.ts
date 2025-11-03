/**
 * Token Bucket Rate Limiter
 * Implements rate limiting using the token bucket algorithm
 * 
 * This utility can be used to control the rate of API requests or any other
 * operations that need rate limiting.
 */
export class RateLimiter {
  private tokens: number
  private lastRefill: number
  private readonly capacity: number
  private readonly refillRate: number // tokens per millisecond
  private readonly minInterval: number // minimum interval between requests in ms

  /**
   * Create a rate limiter
   * @param requestsPerMinute Maximum requests per minute
   * @param burst Maximum burst size (token bucket capacity)
   */
  constructor(requestsPerMinute: number, burst: number) {
    if (!Number.isFinite(requestsPerMinute) || requestsPerMinute <= 0) {
      throw new Error("RateLimiter: requestsPerMinute must be > 0")
    }
    if (!Number.isFinite(burst) || burst < 1) {
      throw new Error("RateLimiter: burst must be >= 1")
    }
    this.capacity = Math.floor(burst)
    this.tokens = this.capacity
    this.refillRate = requestsPerMinute / 60000 // tokens per ms
    this.lastRefill = Date.now()
    this.minInterval = Math.max(1, Math.floor(60000 / requestsPerMinute)) // ms
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now()
    const elapsed = now - this.lastRefill
    const tokensToAdd = elapsed * this.refillRate

    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd)
      this.lastRefill = now
    }
  }

  /**
   * Acquire a token, waiting if necessary
   * @returns Promise that resolves when a token is acquired
   */
  async acquire(): Promise<void> {
    this.refill()

    if (this.tokens >= 1) {
      this.tokens -= 1
      return
    }

    // Need to wait for tokens
    const tokensNeeded = 1 - this.tokens
    const waitTime = Math.max(tokensNeeded / this.refillRate, this.minInterval)

    await new Promise((resolve) => setTimeout(resolve, waitTime))

    // Try again after waiting
    return this.acquire()
  }

  /**
   * Try to acquire a token without waiting
   * @returns true if token was acquired, false otherwise
   */
  tryAcquire(): boolean {
    this.refill()

    if (this.tokens >= 1) {
      this.tokens -= 1
      return true
    }

    return false
  }

  /**
   * Get current token count
   */
  getTokens(): number {
    this.refill()
    return this.tokens
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.tokens = this.capacity
    this.lastRefill = Date.now()
  }
}
