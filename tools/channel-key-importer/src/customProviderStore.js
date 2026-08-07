import { randomUUID } from "node:crypto"
import { join } from "node:path"

import { DATA_DIR } from "./dataPath.js"
import { resolveProviderBaseUrl } from "./providers.js"
import { createJsonStateStore } from "./sharedStorage.js"

const CUSTOM_PROVIDER_PATH = join(DATA_DIR, "custom-openai-providers.json")
const REQUIRED_BASE_URL_PROVIDER = Object.freeze({
  baseUrl: "",
  requiresBaseUrl: true,
})

const compareByName = (left, right) =>
  left.name.localeCompare(right.name, "zh-CN", {
    numeric: true,
    sensitivity: "base",
  })

const normalizeName = (value) => {
  const name = String(value || "").trim()
  if (!name) throw new Error("请输入自定义供应商名称")
  if (name.length > 60) throw new Error("供应商名称不能超过 60 个字符")
  return name
}

const normalizeProvider = (value) => {
  const name = normalizeName(value?.name)
  return {
    id: String(value?.id || randomUUID()),
    name,
    baseUrl: resolveProviderBaseUrl(REQUIRED_BASE_URL_PROVIDER, value?.baseUrl),
    createdAt: String(value?.createdAt || new Date().toISOString()),
    updatedAt: String(value?.updatedAt || new Date().toISOString()),
  }
}

export function normalizeCustomProviderState(value) {
  if (!Array.isArray(value)) return []
  const byId = new Map()
  for (const item of value) {
    try {
      const provider = normalizeProvider(item)
      byId.set(provider.id, provider)
    } catch {
      // Ignore incomplete legacy rows while keeping every valid preset.
    }
  }
  return [...byId.values()].sort(compareByName)
}

export class CustomProviderStore {
  constructor({ stateStore, now = () => new Date() } = {}) {
    this.stateStore =
      stateStore ||
      createJsonStateStore({
        key: "custom-openai-providers",
        path: CUSTOM_PROVIDER_PATH,
      })
    this.now = now
  }

  async list() {
    return normalizeCustomProviderState(await this.stateStore.read([]))
  }

  async get(providerId) {
    return (
      (await this.list()).find(
        (provider) => provider.id === String(providerId || ""),
      ) || null
    )
  }

  async save(input) {
    const providers = await this.list()
    const requestedId = String(input?.id || "")
    const existing = requestedId
      ? providers.find((provider) => provider.id === requestedId)
      : null
    if (requestedId && !existing) throw new Error("自定义供应商不存在")
    const now = this.now().toISOString()
    const provider = normalizeProvider({
      ...input,
      id: existing?.id || randomUUID(),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    })
    const duplicateName = providers.find(
      (item) =>
        item.id !== provider.id &&
        item.name.localeCompare(provider.name, "zh-CN", {
          sensitivity: "base",
        }) === 0,
    )
    if (duplicateName) throw new Error("已经存在同名的自定义供应商")
    const next = existing
      ? providers.map((item) => (item.id === provider.id ? provider : item))
      : [...providers, provider]
    await this.stateStore.write(next.sort(compareByName))
    return provider
  }

  async remove(providerId) {
    const providers = await this.list()
    const id = String(providerId || "")
    if (!providers.some((provider) => provider.id === id)) {
      throw new Error("自定义供应商不存在")
    }
    await this.stateStore.write(
      providers.filter((provider) => provider.id !== id),
    )
  }
}
