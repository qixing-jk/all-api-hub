import { randomUUID } from "node:crypto"

const PREVIEW_TTL_MS = 5 * 60 * 1000

export class PreviewStore {
  #entries = new Map()

  create(value) {
    this.prune()
    const id = randomUUID()
    this.#entries.set(id, {
      expiresAt: Date.now() + PREVIEW_TTL_MS,
      value,
    })
    return id
  }

  take(id) {
    const value = this.get(id)
    this.delete(id)
    return value
  }

  get(id) {
    const entry = this.#entries.get(id)
    if (!entry || entry.expiresAt <= Date.now()) {
      this.#entries.delete(id)
      throw new Error("预览已过期，请重新分析 Key")
    }
    return entry.value
  }

  delete(id) {
    this.#entries.delete(id)
  }

  prune() {
    const now = Date.now()
    for (const [id, entry] of this.#entries) {
      if (entry.expiresAt <= now) this.#entries.delete(id)
    }
  }
}
