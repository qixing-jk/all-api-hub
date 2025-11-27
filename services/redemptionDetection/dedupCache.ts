/**
 * Deduplication Cache for Redemption Code Detection
 * Prevents duplicate prompts for the same {url, code} within a TTL period
 */

interface CacheEntry {
  url: string
  code: string
  timestamp: number
  suppressed: boolean // User explicitly suppressed this prompt
}

const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes
const COOLDOWN_MS = 4000 // 4 seconds between prompts
const CLEANUP_INTERVAL_MS = 60 * 1000 // Cleanup every minute

export class RedemptionDedupCache {
  private cache: Map<string, CacheEntry> = new Map()
  private lastPromptTime = 0
  private cleanupTimer?: ReturnType<typeof setTimeout>

  constructor() {
    this.startCleanupTimer()
  }

  /**
   * Generate cache key from URL and code
   */
  private getCacheKey(url: string, code: string): string {
    return `${url}::${code}`
  }

  /**
   * Check if a code was recently seen and should be skipped
   */
  shouldSkip(url: string, code: string): boolean {
    const key = this.getCacheKey(url, code)
    const entry = this.cache.get(key)

    if (!entry) {
      return false
    }

    // Check if TTL expired
    const now = Date.now()
    if (now - entry.timestamp > CACHE_TTL_MS) {
      this.cache.delete(key)
      return false
    }

    // If user suppressed, skip
    if (entry.suppressed) {
      return true
    }

    // Entry exists and is valid, skip
    return true
  }

  /**
   * Check if we're in cool-down period
   */
  isInCooldown(): boolean {
    const now = Date.now()
    return now - this.lastPromptTime < COOLDOWN_MS
  }

  /**
   * Mark a code as seen (not suppressed)
   */
  markSeen(url: string, code: string): void {
    const key = this.getCacheKey(url, code)
    this.cache.set(key, {
      url,
      code,
      timestamp: Date.now(),
      suppressed: false
    })
    this.lastPromptTime = Date.now()
  }

  /**
   * Mark a code as suppressed by user
   */
  markSuppressed(url: string, code: string): void {
    const key = this.getCacheKey(url, code)
    this.cache.set(key, {
      url,
      code,
      timestamp: Date.now(),
      suppressed: true
    })
  }

  /**
   * Remove expired entries
   */
  cleanup(): void {
    const now = Date.now()
    const keysToDelete: string[] = []

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > CACHE_TTL_MS) {
        keysToDelete.push(key)
      }
    }

    keysToDelete.forEach((key) => this.cache.delete(key))

    if (keysToDelete.length > 0) {
      console.log(
        `[RedemptionDedup] Cleaned up ${keysToDelete.length} expired entries`
      )
    }
  }

  /**
   * Start periodic cleanup
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanup()
    }, CLEANUP_INTERVAL_MS)
  }

  /**
   * Stop cleanup timer (for cleanup)
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = undefined
    }
    this.cache.clear()
  }

  /**
   * Get current cache size (for debugging)
   */
  size(): number {
    return this.cache.size
  }
}

// Singleton instance
export const redemptionDedupCache = new RedemptionDedupCache()
