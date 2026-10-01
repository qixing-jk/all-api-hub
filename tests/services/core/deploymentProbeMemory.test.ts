import { afterEach, describe, expect, it, vi } from "vitest"

import {
  createDeploymentProbeMemory,
  normalizeDeploymentScope,
} from "~/services/core/deploymentProbeMemory"

describe("normalizeDeploymentScope", () => {
  it("treats spelling variants of one deployment as one scope", () => {
    const scopes = [
      "https://site.example.invalid",
      "https://site.example.invalid/",
      "https://site.example.invalid///",
      "  https://site.example.invalid/  ",
    ].map(normalizeDeploymentScope)

    expect(new Set(scopes).size).toBe(1)
  })

  it("keeps distinct deployments apart", () => {
    expect(normalizeDeploymentScope("https://a.example.invalid")).not.toBe(
      normalizeDeploymentScope("https://b.example.invalid"),
    )
  })
})

describe("deployment probe memory", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("reads nothing for a deployment that was never answered for", () => {
    const memory = createDeploymentProbeMemory<string>()

    expect(memory.read("https://site.example.invalid")).toBeUndefined()
    expect(memory.size).toBe(0)
  })

  it("remembers a value under every spelling of the same deployment", () => {
    const memory = createDeploymentProbeMemory<string>()

    memory.remember("https://site.example.invalid/", "scoped")

    expect(memory.read("https://site.example.invalid")).toBe("scoped")
    expect(memory.read("  https://site.example.invalid//")).toBe("scoped")
    expect(memory.size).toBe(1)
  })

  it("keeps one deployment's answer out of another's", () => {
    const memory = createDeploymentProbeMemory<string>()

    memory.remember("https://a.example.invalid", "scoped")
    memory.remember("https://b.example.invalid", "legacy")

    expect(memory.read("https://a.example.invalid")).toBe("scoped")
    expect(memory.read("https://b.example.invalid")).toBe("legacy")
  })

  it("forgets one deployment without touching the rest", () => {
    const memory = createDeploymentProbeMemory<string>()
    memory.remember("https://a.example.invalid", "scoped")
    memory.remember("https://b.example.invalid", "legacy")

    memory.forget("https://a.example.invalid/")

    expect(memory.read("https://a.example.invalid")).toBeUndefined()
    expect(memory.read("https://b.example.invalid")).toBe("legacy")
    expect(memory.size).toBe(1)
  })

  it("clears every remembered deployment", () => {
    const memory = createDeploymentProbeMemory<string>()
    memory.remember("https://a.example.invalid", "scoped")
    memory.remember("https://b.example.invalid", "legacy")

    memory.clear()

    expect(memory.size).toBe(0)
    expect(memory.read("https://a.example.invalid")).toBeUndefined()
  })

  it("evicts the least recently written deployment past the bound", () => {
    const memory = createDeploymentProbeMemory<string>({ maxEntries: 2 })
    memory.remember("https://a.example.invalid", "first")
    memory.remember("https://b.example.invalid", "second")

    memory.remember("https://c.example.invalid", "third")

    expect(memory.read("https://a.example.invalid")).toBeUndefined()
    expect(memory.read("https://b.example.invalid")).toBe("second")
    expect(memory.read("https://c.example.invalid")).toBe("third")
    expect(memory.size).toBe(2)
  })

  it("counts a rewritten deployment as the most recently written", () => {
    const memory = createDeploymentProbeMemory<string>({ maxEntries: 2 })
    memory.remember("https://a.example.invalid", "first")
    memory.remember("https://b.example.invalid", "second")

    memory.remember("https://a.example.invalid", "first-again")
    memory.remember("https://c.example.invalid", "third")

    expect(memory.read("https://a.example.invalid")).toBe("first-again")
    expect(memory.read("https://b.example.invalid")).toBeUndefined()
  })

  it("keeps a remembered value until its lifetime elapses", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-01T00:00:00Z"))
    const memory = createDeploymentProbeMemory<string>({ ttlMs: 60_000 })

    memory.remember("https://site.example.invalid", "scoped")
    vi.setSystemTime(new Date("2026-10-01T00:00:59Z"))

    expect(memory.read("https://site.example.invalid")).toBe("scoped")
  })

  it("reads an elapsed value as absent and drops it", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-01T00:00:00Z"))
    const memory = createDeploymentProbeMemory<string>({ ttlMs: 60_000 })

    memory.remember("https://site.example.invalid", "scoped")
    vi.setSystemTime(new Date("2026-10-01T00:01:00Z"))

    expect(memory.read("https://site.example.invalid")).toBeUndefined()
    expect(memory.size).toBe(0)
  })

  it("restarts the lifetime when a deployment is remembered again", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-01T00:00:00Z"))
    const memory = createDeploymentProbeMemory<string>({ ttlMs: 60_000 })

    memory.remember("https://site.example.invalid", "legacy")
    vi.setSystemTime(new Date("2026-10-01T00:00:59Z"))
    memory.remember("https://site.example.invalid", "scoped")
    vi.setSystemTime(new Date("2026-10-01T00:01:30Z"))

    expect(memory.read("https://site.example.invalid")).toBe("scoped")
  })

  it("keeps values indefinitely when no lifetime is configured", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-01T00:00:00Z"))
    const memory = createDeploymentProbeMemory<string>()

    memory.remember("https://site.example.invalid", "scoped")
    vi.setSystemTime(new Date("2027-10-01T00:00:00Z"))

    expect(memory.read("https://site.example.invalid")).toBe("scoped")
  })
})
