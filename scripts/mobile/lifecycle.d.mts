import type { EventEmitter } from "node:events"

export function waitForStop(
  duration: number,
  signals?: EventEmitter,
): Promise<void>
