import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  buildDevBrowserIdentity,
  deriveUnpackedExtensionId,
  isUserDataDirInUse,
  prepareDevBrowserProfile,
  resolveProfileDirectory,
  waitForUserDataDirRelease,
} from "~~/scripts/cdp/dev-browser-identity.mjs"

const roots: string[] = []
afterEach(() => vi.restoreAllMocks())

afterEach(() =>
  roots
    .splice(0)
    .forEach((root) => fs.rmSync(root, { recursive: true, force: true })),
)

function userDataDir(): string {
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "aah-identity-test-"),
  )
  roots.push(root)
  return root
}

function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value))
}

function readJson(file: string) {
  return JSON.parse(fs.readFileSync(file, "utf8"))
}

const extensionId = "abcdefghijklmnopabcdefghijklmnop"

const identity = (profileDir = "/tmp/dev-browser-temp6-abc") =>
  buildDevBrowserIdentity({
    profileDir,
    worktreeName: "temp6",
    isolated: true,
  })

const closedProfile = () => ({
  openFile: () => {
    throw Object.assign(new Error("missing"), { code: "ENOENT" })
  },
  readLink: () => {
    throw Object.assign(new Error("missing"), { code: "ENOENT" })
  },
  kill: () => {
    throw Object.assign(new Error("gone"), { code: "ESRCH" })
  },
  hostname: () => "host",
})

describe("development browser identity", () => {
  it.each(["linux", "darwin"] as const)(
    "uses native POSIX path bytes for the pinned extension id on %s",
    (platform) => {
      vi.spyOn(os, "platform").mockReturnValue(platform)
      // Known SHA-256 vectors over UTF-8 paths, per Chromium GenerateIdForPath.
      expect(deriveUnpackedExtensionId("/tmp/aah-extension")).toBe(
        "ddkalchgicleblpeboanokbladbcfjop",
      )
      expect(deriveUnpackedExtensionId("/tmp/扩展")).toBe(
        "npmcajgoekippanclmdimidcpmkfpfbi",
      )
    },
  )

  /**
   * Both vectors are the ids Chromium recorded for this checkout's output
   * directories, so the derivation is checked against real installs rather
   * than against itself.
   */
  it("derives the id Chromium assigns to an unpacked extension directory", () => {
    const root =
      "C:\\Users\\THINK\\orca\\workspaces\\all-api-hub\\temp6\\.output"
    expect(deriveUnpackedExtensionId(`${root}\\chrome-mv3`)).toBe(
      "jcbjelefngmgijfeannjpidcolijcanf",
    )
    expect(deriveUnpackedExtensionId(`${root}\\chrome-mv3-dev`)).toBe(
      "lgmgkedadolnlojmdknpmlnapgkpjnji",
    )
  })

  it("names isolated profiles after the worktree and shared ones by profile", () => {
    expect(identity().displayName).toBe("AAH temp6")
    expect(
      buildDevBrowserIdentity({
        profileDir: "/tmp/dev-browser",
        worktreeName: "temp6",
        isolated: false,
      }).displayName,
    ).toBe("AAH dev-browser")
  })

  it("derives one stable frame accent from the profile directory", () => {
    expect(identity().accentColor).toBe(identity().accentColor)
    expect(identity().accentColor).toMatch(/^\d{1,3},\d{1,3},\d{1,3}$/)
    expect(identity().accentColor).not.toBe(
      identity("/tmp/dev-browser-temp7-def").accentColor,
    )
  })

  it("resolves the profile directory the browser will open", () => {
    const root = userDataDir()
    expect(resolveProfileDirectory(root)).toBe("Default")
    writeJson(path.join(root, "Local State"), {
      profile: { last_used: "Profile 2" },
    })
    expect(resolveProfileDirectory(root)).toBe("Default")
    fs.mkdirSync(path.join(root, "Profile 2"))
    expect(resolveProfileDirectory(root)).toBe("Profile 2")
  })

  it("names a still default profile and pins the loaded extension", () => {
    const root = userDataDir()
    const result = prepareDevBrowserProfile(
      {
        userDataDir: root,
        identity: identity(),
        extensionIds: [extensionId],
      },
      closedProfile(),
    )
    expect(result).toMatchObject({
      applied: true,
      profileDirectory: "Default",
      renamed: true,
      pinnedExtensionIds: [extensionId],
      themeReserved: false,
    })
    expect(
      readJson(path.join(root, "Local State")).profile.info_cache.Default,
    ).toMatchObject({ name: "AAH temp6", is_using_default_name: false })
    expect(
      readJson(path.join(root, "Default", "Preferences")).extensions
        .pinned_extensions,
    ).toEqual([extensionId])
  })

  it("keeps a name the user already chose for the profile", () => {
    const root = userDataDir()
    writeJson(path.join(root, "Local State"), {
      profile: {
        info_cache: {
          Default: { name: "Personal", is_using_default_name: false },
        },
      },
    })
    const result = prepareDevBrowserProfile(
      { userDataDir: root, identity: identity(), extensionIds: [extensionId] },
      closedProfile(),
    )
    expect(result).toMatchObject({ renamed: false, namePreserved: true })
    expect(
      readJson(path.join(root, "Local State")).profile.info_cache.Default.name,
    ).toBe("Personal")
  })

  it("preserves unrelated preferences and existing pinned extensions", () => {
    const root = userDataDir()
    const other = "ponmlkjihgfedcbaponmlkjihgfedcba"
    writeJson(path.join(root, "Local State"), {
      profile: {
        info_cache: {
          Default: {
            name: "Work",
            is_using_default_name: false,
            avatar_icon: "chrome://theme/IDR_PROFILE_AVATAR_21",
            is_using_default_avatar: false,
          },
        },
      },
    })
    writeJson(path.join(root, "Default", "Preferences"), {
      profile: { avatar_index: 21 },
      extensions: {
        pinned_extensions: [other],
        theme: { id: "user_theme_id" },
      },
    })
    const result = prepareDevBrowserProfile(
      { userDataDir: root, identity: identity(), extensionIds: [extensionId] },
      closedProfile(),
    )
    const prefs = readJson(path.join(root, "Default", "Preferences"))
    expect(prefs.extensions.pinned_extensions).toEqual([other, extensionId])
    expect(prefs.extensions.theme).toEqual({ id: "user_theme_id" })
    expect(prefs.profile.avatar_index).toBe(21)
    expect(result.themeReserved).toBe(true)
    expect(result.avatarIndex).toBeUndefined()
  })

  it("updates a name this module wrote earlier", () => {
    const root = userDataDir()
    writeJson(path.join(root, "Local State"), {
      profile: {
        info_cache: {
          Default: { name: "AAH temp9", is_using_default_name: false },
        },
      },
    })
    const result = prepareDevBrowserProfile(
      { userDataDir: root, identity: identity(), extensionIds: [extensionId] },
      closedProfile(),
    )
    expect(result.renamed).toBe(true)
    expect(
      readJson(path.join(root, "Local State")).profile.info_cache.Default.name,
    ).toBe("AAH temp6")
  })

  it("gives a default profile its own avatar", () => {
    const root = userDataDir()
    const result = prepareDevBrowserProfile(
      { userDataDir: root, identity: identity(), extensionIds: [extensionId] },
      closedProfile(),
    )
    const avatarIndex = result.avatarIndex ?? 0
    expect(avatarIndex).toBeGreaterThanOrEqual(1)
    expect(avatarIndex).toBeLessThanOrEqual(17)
    expect(
      readJson(path.join(root, "Local State")).profile.info_cache.Default,
    ).toMatchObject({
      avatar_icon: `chrome://theme/IDR_PROFILE_AVATAR_${avatarIndex}`,
      is_using_default_avatar: false,
    })
    expect(
      readJson(path.join(root, "Default", "Preferences")).profile.avatar_index,
    ).toBe(avatarIndex)
  })

  it("ignores malformed extension ids", () => {
    const root = userDataDir()
    const result = prepareDevBrowserProfile(
      { userDataDir: root, identity: identity(), extensionIds: ["not-an-id"] },
      closedProfile(),
    )
    expect(result.pinnedExtensionIds).toEqual([])
  })

  it("is idempotent on an already branded profile", () => {
    const root = userDataDir()
    const prepare = () =>
      prepareDevBrowserProfile(
        {
          userDataDir: root,
          identity: identity(),
          extensionIds: [extensionId],
        },
        closedProfile(),
      )
    prepare()
    expect(prepare()).toMatchObject({
      applied: true,
      renamed: false,
      pinnedExtensionIds: [],
    })
  })

  it("writes nothing while a browser holds the user data directory", () => {
    const root = userDataDir()
    const result = prepareDevBrowserProfile(
      { userDataDir: root, identity: identity(), extensionIds: [extensionId] },
      {
        ...closedProfile(),
        openFile: () => {
          throw Object.assign(new Error("busy"), { code: "EPERM" })
        },
      },
    )
    expect(result).toMatchObject({ applied: false, reason: "profile_in_use" })
    expect(fs.existsSync(path.join(root, "Local State"))).toBe(false)
  })

  it("recognises both Chromium lock styles", () => {
    const root = userDataDir()
    const lockfile = path.join(root, "lockfile")
    fs.writeFileSync(lockfile, "")
    expect(
      isUserDataDirInUse(root, {
        ...closedProfile(),
        openFile: () => {
          throw Object.assign(new Error("busy"), { code: "EPERM" })
        },
      }),
    ).toBe(true)
    fs.rmSync(lockfile)
    expect(isUserDataDirInUse(root, closedProfile())).toBe(false)
    expect(
      isUserDataDirInUse(root, {
        ...closedProfile(),
        readLink: () => "host-4242",
        kill: () => true,
      }),
    ).toBe(true)
    expect(
      isUserDataDirInUse(root, {
        ...closedProfile(),
        readLink: () => "other-host-4242",
        kill: () => true,
      }),
    ).toBe(true)
  })

  it("keeps a POSIX profile locked when process liveness cannot be established", () => {
    expect(
      isUserDataDirInUse(userDataDir(), {
        ...closedProfile(),
        readLink: () => "host-4242",
        kill: () => {
          throw Object.assign(new Error("not permitted"), { code: "EPERM" })
        },
      }),
    ).toBe(true)
  })

  it("leaves an unreadable profile file untouched", () => {
    const root = userDataDir()
    const stateFile = path.join(root, "Local State")
    fs.writeFileSync(stateFile, "{ not json")
    const result = prepareDevBrowserProfile(
      { userDataDir: root, identity: identity(), extensionIds: [extensionId] },
      closedProfile(),
    )
    expect(result.applied).toBe(false)
    expect(fs.readFileSync(stateFile, "utf8")).toBe("{ not json")
    expect(fs.existsSync(path.join(root, "Default", "Preferences"))).toBe(false)
  })

  it("waits for a restarting browser to release the profile", async () => {
    const root = userDataDir()
    let probes = 0
    expect(
      await waitForUserDataDirRelease(
        root,
        { timeoutMs: 40, intervalMs: 5 },
        {
          ...closedProfile(),
          openFile: () => {
            probes += 1
            if (probes < 3)
              throw Object.assign(new Error("busy"), { code: "EPERM" })
            throw Object.assign(new Error("missing"), { code: "ENOENT" })
          },
        },
      ),
    ).toBe(true)
    expect(probes).toBe(3)
    expect(
      await waitForUserDataDirRelease(
        root,
        { timeoutMs: 20, intervalMs: 5 },
        {
          ...closedProfile(),
          openFile: () => {
            throw Object.assign(new Error("busy"), { code: "EPERM" })
          },
        },
      ),
    ).toBe(false)
  })
})
