import { execFile } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { platform } from "node:os"
import { dirname, join } from "node:path"
import { promisify } from "node:util"

import { DATA_DIR } from "./dataPath.js"

const execFileAsync = promisify(execFile)
const KEYCHAIN_SERVICE = "dataeyesai"
const CONFIG_PATH = join(DATA_DIR, "config.json")

const emptyConfig = () => ({
  profileId: "",
  name: "",
  nameSource: "host",
  targetUrl: "",
  userId: "",
  rememberToken: false,
  allowInsecureHttp: false,
})

const targetOrigin = (value) => {
  try {
    return new URL(value).origin
  } catch {
    return ""
  }
}

export function findProfileForRecord(record, profiles) {
  const recordOrigin = targetOrigin(record?.targetUrl)
  if (!recordOrigin) return null
  const profileById = profiles.find(
    (profile) => profile.profileId === record.profileId,
  )
  if (profileById && targetOrigin(profileById.targetUrl) === recordOrigin) {
    return profileById
  }
  return (
    profiles.find(
      (profile) => targetOrigin(profile.targetUrl) === recordOrigin,
    ) || null
  )
}

export function normalizeConfigState(value) {
  if (Array.isArray(value?.profiles)) {
    const profiles = value.profiles
      .filter((profile) => profile?.targetUrl && profile?.userId)
      .map((profile) => {
        const host = new URL(profile.targetUrl).host
        const name = String(profile.name || host)
        return {
          profileId: String(profile.profileId || randomUUID()),
          name,
          nameSource: ["host", "detected", "custom"].includes(
            profile.nameSource,
          )
            ? profile.nameSource
            : name === host
              ? "host"
              : "custom",
          targetUrl: String(profile.targetUrl),
          userId: String(profile.userId),
          rememberToken: profile.rememberToken === true,
          allowInsecureHttp: profile.allowInsecureHttp === true,
        }
      })
    const requestedActiveId = String(value.activeProfileId || "")
    return {
      activeProfileId: profiles.some(
        (profile) => profile.profileId === requestedActiveId,
      )
        ? requestedActiveId
        : profiles[0]?.profileId || "",
      profiles,
    }
  }

  if (value?.targetUrl && value?.userId) {
    const profileId = `legacy-${createHash("sha256")
      .update(`${value.targetUrl}#${value.userId}`)
      .digest("hex")
      .slice(0, 12)}`
    return {
      activeProfileId: profileId,
      profiles: [
        {
          profileId,
          name: new URL(value.targetUrl).host,
          nameSource: "host",
          targetUrl: String(value.targetUrl),
          userId: String(value.userId),
          rememberToken: value.rememberToken === true,
          allowInsecureHttp: value.allowInsecureHttp === true,
        },
      ],
    }
  }
  return { activeProfileId: "", profiles: [] }
}

export class ConfigStore {
  #memoryTokens = new Map()
  #sessions = new Map()
  #tokenStore = null

  setTokenStore(tokenStore) {
    this.#tokenStore = tokenStore || null
  }

  async #readState() {
    try {
      return normalizeConfigState(
        JSON.parse(await readFile(CONFIG_PATH, "utf8")),
      )
    } catch {
      return normalizeConfigState(null)
    }
  }

  async #writeState(state) {
    await mkdir(dirname(CONFIG_PATH), { recursive: true, mode: 0o700 })
    await writeFile(CONFIG_PATH, `${JSON.stringify(state, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    })
  }

  async listProfiles() {
    return (await this.#readState()).profiles
  }

  async readConfig(profileId = "") {
    const state = await this.#readState()
    const selectedId = profileId || state.activeProfileId
    return (
      state.profiles.find((profile) => profile.profileId === selectedId) ||
      emptyConfig()
    )
  }

  async saveConfig(config) {
    const state = await this.#readState()
    const existing = config.profileId
      ? state.profiles.find((profile) => profile.profileId === config.profileId)
      : state.profiles.find(
          (profile) =>
            profile.targetUrl === config.targetUrl &&
            profile.userId === config.userId,
        )
    const profile = {
      profileId: existing?.profileId || randomUUID(),
      name: String(
        config.name || existing?.name || new URL(config.targetUrl).host,
      ),
      nameSource: config.nameSource || existing?.nameSource || "host",
      targetUrl: config.targetUrl,
      userId: config.userId,
      rememberToken: config.rememberToken === true,
      allowInsecureHttp: config.allowInsecureHttp === true,
    }
    const profiles = existing
      ? state.profiles.map((item) =>
          item.profileId === existing.profileId ? profile : item,
        )
      : [...state.profiles, profile]
    await this.#writeState({
      activeProfileId: profile.profileId,
      profiles,
    })
    return profile
  }

  async saveDetectedName(profileId, name) {
    const state = await this.#readState()
    const profile = state.profiles.find((item) => item.profileId === profileId)
    const detectedName = String(name || "")
      .trim()
      .slice(0, 80)
    if (!profile || !detectedName || profile.nameSource === "custom") {
      return profile || null
    }
    const updated = {
      ...profile,
      name: detectedName,
      nameSource: "detected",
    }
    await this.#writeState({
      ...state,
      profiles: state.profiles.map((item) =>
        item.profileId === profileId ? updated : item,
      ),
    })
    return updated
  }

  async selectProfile(profileId) {
    const state = await this.#readState()
    if (!state.profiles.some((profile) => profile.profileId === profileId)) {
      throw new Error("New API 配置不存在")
    }
    await this.#writeState({ ...state, activeProfileId: profileId })
    return await this.readConfig(profileId)
  }

  async saveToken(account, token, remember) {
    this.#memoryTokens.set(account, token)
    if (!remember) return
    if (this.#tokenStore) {
      await this.#tokenStore.save(account, token)
      return
    }
    if (platform() !== "darwin") {
      throw new Error("当前系统暂不支持安全持久化管理员 Token")
    }
    await execFileAsync("security", [
      "add-generic-password",
      "-U",
      "-a",
      account,
      "-s",
      KEYCHAIN_SERVICE,
      "-w",
      token,
    ])
  }

  async readToken(account, remember) {
    if (this.#memoryTokens.has(account)) return this.#memoryTokens.get(account)
    if (!remember) return ""
    if (this.#tokenStore) {
      const storedToken = await this.#tokenStore.read(account)
      if (storedToken) return storedToken
    }
    if (platform() !== "darwin") return ""
    try {
      const { stdout } = await execFileAsync("security", [
        "find-generic-password",
        "-a",
        account,
        "-s",
        KEYCHAIN_SERVICE,
        "-w",
      ])
      return stdout.trim()
    } catch {
      return ""
    }
  }

  saveSession(session) {
    this.#sessions.set(
      getCredentialAccount(session.targetUrl, session.userId),
      { ...session },
    )
  }

  readSession(targetUrl, userId) {
    const session = this.#sessions.get(getCredentialAccount(targetUrl, userId))
    return session ? { ...session } : null
  }

  clearSession(targetUrl, userId) {
    if (targetUrl && userId) {
      this.#sessions.delete(getCredentialAccount(targetUrl, userId))
      return
    }
    this.#sessions.clear()
  }
}

export function getCredentialAccount(targetUrl, userId) {
  return `${new URL(targetUrl).origin}#${userId}`
}
