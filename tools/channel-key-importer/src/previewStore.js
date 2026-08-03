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
    const value = this.claim(id)
    this.delete(id)
    return value
  }

  claim(id) {
    const value = this.get(id)
    const entry = this.#entries.get(id)
    if (entry.claimed) throw new Error("这批 Key 正在写入，请勿重复提交")
    entry.claimed = true
    return value
  }

  release(id) {
    const entry = this.#entries.get(id)
    if (entry) entry.claimed = false
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
