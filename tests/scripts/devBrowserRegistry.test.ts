import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  classifyDevProfiles,
  collectProfileWorktrees,
  describeBytes,
  formatDebugBrowserReport,
  listDebugBrowserProcesses,
  parseDebugBrowserProcessCommandLine,
  planProfileCleanup,
  pruneProfileCaches,
  removeProfileDir,
} from "~~/scripts/cdp/dev-browser-registry.mjs"

const roots: string[] = []

afterEach(() =>
  roots
    .splice(0)
    .forEach((root) => fs.rmSync(root, { recursive: true, force: true })),
)
afterEach(() => vi.restoreAllMocks())

function fixtureRoot(): string {
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "aah-registry-test-"),
  )
  roots.push(root)
  return root
}

function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value))
}

/** One profile directory holding a loaded extension from `worktree`. */
function writeProfile(
  profilesBaseDir: string,
  name: string,
  worktrees: string[],
  { file = "Secure Preferences", bytes = 2048 } = {},
) {
  const profileDir = path.join(profilesBaseDir, name)
  writeJson(path.join(profileDir, "Default", file), {
    extensions: {
      settings: Object.fromEntries(
        worktrees.map((worktree, index) => [
          `extension${index}`,
          { path: path.join(worktree, ".output", "chrome-mv3") },
        ]),
      ),
    },
  })
  fs.writeFileSync(path.join(profileDir, "Local State"), "x".repeat(bytes))
  return profileDir
}

/** Simulate the OS rejecting access to Chromium's held profile lock. */
function holdProfileLock(profileDir: string) {
  const open = fs.openSync
  vi.spyOn(fs, "openSync").mockImplementation((file, flags, mode) => {
    if (file === path.join(profileDir, "lockfile")) {
      throw Object.assign(new Error("profile is locked"), { code: "EPERM" })
    }
    return open(file, flags, mode)
  })
}

describe("debug browser discovery", () => {
  it("reads the port, profile and mounted extension from a launch command", () => {
    const parsed = parseDebugBrowserProcessCommandLine(
      [
        '"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"',
        "--remote-debugging-port=9320",
        "--user-data-dir=C:\\Profiles\\dev-browser-temp6-97fbf3e0",
        "--profile-directory=Default",
        "--load-extension=C:\\wt\\temp6\\.output\\chrome-mv3",
        "--disable-extensions-except=C:\\wt\\temp6\\.output\\chrome-mv3",
        "--enable-automation",
      ].join(" "),
    )
    expect(parsed).toEqual({
      port: 9320,
      userDataDir: "C:\\Profiles\\dev-browser-temp6-97fbf3e0",
      extensionDirs: ["C:\\wt\\temp6\\.output\\chrome-mv3"],
    })
  })

  it("accepts quoted and space-separated flag values", () => {
    expect(
      parseDebugBrowserProcessCommandLine(
        'msedge --remote-debugging-port 9222 --user-data-dir="C:\\Users\\My Name\\AllApiHub\\dev-browser"',
      ),
    ).toMatchObject({
      port: 9222,
      userDataDir: "C:\\Users\\My Name\\AllApiHub\\dev-browser",
    })
  })

  it("reassembles unquoted space-containing paths on POSIX using path validation", () => {
    const root = fixtureRoot()
    const profileDir = path.join(root, "my debug profile")
    fs.mkdirSync(profileDir, { recursive: true })

    const parsed = parseDebugBrowserProcessCommandLine(
      `msedge --remote-debugging-port 9222 --user-data-dir=${profileDir} https://example.com`,
    )
    expect(parsed).toMatchObject({
      port: 9222,
      userDataDir: profileDir,
    })
  })

  it("stops before trailing positional arguments when path cannot be reassembled", () => {
    const parsed = parseDebugBrowserProcessCommandLine(
      "msedge --remote-debugging-port 9222 --user-data-dir=/nonexistent/path/profile https://example.com",
    )
    expect(parsed?.userDataDir).not.toContain("https://example.com")
  })

  it("reassembles unquoted space-containing extension paths and stops before next switch", () => {
    const root = fixtureRoot()
    const extDir = path.join(root, "my unpacked extension")
    fs.mkdirSync(extDir, { recursive: true })

    const parsed = parseDebugBrowserProcessCommandLine(
      `msedge --remote-debugging-port 9222 --user-data-dir=C:\\p --load-extension=${extDir} --enable-automation`,
    )
    expect(parsed?.extensionDirs).toEqual([extDir])
  })

  it.each([
    [
      "a renderer child of a debug browser",
      "--type=renderer --user-data-dir=C:\\p --remote-debugging-port=9222",
    ],
    ["a browser without CDP", '"msedge.exe" --user-data-dir=C:\\p'],
    [
      "a browser without a profile",
      '"msedge.exe" --remote-debugging-port=9222',
    ],
    ["an empty command line", ""],
  ])("ignores %s", (_label, commandLine) => {
    expect(parseDebugBrowserProcessCommandLine(commandLine)).toBeNull()
  })

  it("lists only the browser processes that serve CDP", async () => {
    const readProcesses = vi.fn(async () => [
      {
        pid: 1,
        commandLine: "msedge --type=renderer --remote-debugging-port=9320",
      },
      {
        pid: 2,
        commandLine:
          "msedge --remote-debugging-port=9320 --user-data-dir=C:\\p\\dev-browser",
      },
      { pid: 3, commandLine: "explorer.exe" },
    ])
    await expect(listDebugBrowserProcesses({ readProcesses })).resolves.toEqual(
      [
        {
          pid: 2,
          port: 9320,
          userDataDir: "C:\\p\\dev-browser",
          extensionDirs: [],
        },
      ],
    )
    expect(readProcesses).toHaveBeenCalledTimes(1)
  })
})

describe("debug profile inventory", () => {
  it("protects a locked profile even when no CDP process was discovered", () => {
    const profilesBaseDir = fixtureRoot()
    const profileDir = writeProfile(
      profilesBaseDir,
      "dev-browser-temp6-0123456789abcdef",
      [path.join(profilesBaseDir, "gone")],
    )
    holdProfileLock(profileDir)

    expect(classifyDevProfiles({ profilesBaseDir })[0]).toMatchObject({
      inUse: true,
      orphan: false,
    })
  })

  it("keeps a profile when only part of its ownership data can be read", () => {
    const profilesBaseDir = fixtureRoot()
    const profileDir = writeProfile(
      profilesBaseDir,
      "dev-browser-temp6-0123456789abcdef",
      [path.join(profilesBaseDir, "gone")],
    )
    fs.mkdirSync(path.join(profileDir, "Profile 1"))
    fs.writeFileSync(
      path.join(profileDir, "Profile 1", "Secure Preferences"),
      "{invalid json",
    )

    const profiles = classifyDevProfiles({ profilesBaseDir })
    expect(profiles[0]?.orphan).toBe(false)
    expect(
      planProfileCleanup(profiles, { pruneProfiles: true }).deleteProfiles,
    ).toEqual([])
  })

  it("collects the worktrees a profile has loaded", () => {
    const profilesBaseDir = fixtureRoot()
    const worktree = path.join(profilesBaseDir, "checkout")
    const profileDir = writeProfile(profilesBaseDir, "dev-browser-temp-abc", [
      worktree,
    ])
    writeJson(path.join(profileDir, "Default", "Preferences"), {
      extensions: {
        settings: {
          other: { path: path.join(worktree, ".output", "chrome-mv3-dev") },
        },
      },
    })
    expect(collectProfileWorktrees(profileDir)).toEqual([worktree])
  })

  it("ignores profiles without readable state", () => {
    const profilesBaseDir = fixtureRoot()
    const profileDir = path.join(
      profilesBaseDir,
      "dev-browser-empty-0011223344556677",
    )
    fs.mkdirSync(path.join(profileDir, "Default"), { recursive: true })
    fs.writeFileSync(
      path.join(profileDir, "Default", "Preferences"),
      "{not json",
    )
    expect(collectProfileWorktrees(profileDir)).toEqual([])
  })

  it("sizes profiles and marks the ones whose worktree is gone", () => {
    const profilesBaseDir = fixtureRoot()
    const worktree = path.join(profilesBaseDir, "temp6")
    fs.mkdirSync(worktree, { recursive: true })
    writeProfile(
      profilesBaseDir,
      "dev-browser-temp6-0123456789abcdef",
      [worktree],
      {
        bytes: 512,
      },
    )
    writeProfile(profilesBaseDir, "dev-browser-temp9-fedcba9876543210", [
      path.join(profilesBaseDir, "removed-worktree"),
    ])

    const [orphan, live] = classifyDevProfiles({ profilesBaseDir })
    expect(orphan).toMatchObject({
      name: "dev-browser-temp9-fedcba9876543210",
      orphan: true,
      inUse: false,
    })
    expect(live).toMatchObject({
      name: "dev-browser-temp6-0123456789abcdef",
      orphan: false,
    })
    expect(orphan?.sizeBytes ?? 0).toBeGreaterThan(live?.sizeBytes ?? 0)
  })

  it("never treats the shared profile or a running one as orphaned", () => {
    const profilesBaseDir = fixtureRoot()
    const runningDir = writeProfile(
      profilesBaseDir,
      "dev-browser-temp6-0123456789abcdef",
      [path.join(profilesBaseDir, "gone-a")],
    )
    writeProfile(profilesBaseDir, "dev-browser", [
      path.join(profilesBaseDir, "gone-b"),
    ])

    const byName = Object.fromEntries(
      classifyDevProfiles({
        profilesBaseDir,
        runningUserDataDirs: [runningDir],
      }).map((profile) => [profile.name, profile]),
    )
    expect(byName["dev-browser-temp6-0123456789abcdef"]).toMatchObject({
      inUse: true,
      orphan: false,
    })
    expect(byName["dev-browser"]).toMatchObject({ orphan: false })
  })

  it("never reaps a profile whose name this tooling did not generate", () => {
    const profilesBaseDir = fixtureRoot()
    // Hand-named profiles are somebody's deliberate setup; they are reported
    // with their size but must not be deleted by --clean.
    writeProfile(profilesBaseDir, "dev-browser-daily", [
      path.join(profilesBaseDir, "gone-worktree"),
    ])
    writeProfile(profilesBaseDir, "edge-dev", [
      path.join(profilesBaseDir, "gone-worktree"),
    ])

    const byName = Object.fromEntries(
      classifyDevProfiles({ profilesBaseDir }).map((profile) => [
        profile.name,
        profile,
      ]),
    )
    expect(byName["dev-browser-daily"]).toMatchObject({
      generated: false,
      orphan: false,
    })
    // Anything outside the generated namespace is not even inventoried.
    expect(byName["edge-dev"]).toBeUndefined()
  })

  it("never reaps a profile it could not read a checkout from", () => {
    const profilesBaseDir = fixtureRoot()
    writeProfile(profilesBaseDir, "dev-browser-temp8-0123456789abcdef", [])

    const report = classifyDevProfiles({ profilesBaseDir })
    expect(report[0]).toMatchObject({ worktrees: [], orphan: false })
  })

  it("lists profiles largest first", () => {
    const profilesBaseDir = fixtureRoot()
    writeProfile(profilesBaseDir, "dev-browser-small-0011223344556677", [], {
      bytes: 128,
    })
    writeProfile(profilesBaseDir, "dev-browser-large-aabbccddeeff0011", [], {
      bytes: 4096,
    })
    expect(
      classifyDevProfiles({ profilesBaseDir }).map((profile) => profile.name),
    ).toEqual([
      "dev-browser-large-aabbccddeeff0011",
      "dev-browser-small-0011223344556677",
    ])
  })
})

describe("debug profile cleanup", () => {
  it("rechecks the lock before removing a previously idle profile or its caches", () => {
    const profilesBaseDir = fixtureRoot()
    const profileDir = writeProfile(
      profilesBaseDir,
      "dev-browser-temp6-0123456789abcdef",
      [path.join(profilesBaseDir, "gone")],
    )
    const cache = path.join(profileDir, "component_crx_cache")
    fs.mkdirSync(cache)
    fs.writeFileSync(path.join(cache, "blob"), "keep")
    const plan = planProfileCleanup(classifyDevProfiles({ profilesBaseDir }), {
      pruneProfiles: true,
    })
    expect(plan.deleteProfiles).toHaveLength(1)
    holdProfileLock(profileDir)

    expect(pruneProfileCaches(profileDir, { olderThanMs: 0 }).removed).toEqual(
      [],
    )
    expect(removeProfileDir(plan.deleteProfiles[0]!.dir)).toBe(false)
    expect(fs.readFileSync(path.join(cache, "blob"), "utf8")).toBe("keep")
  })

  it("removes only regenerable caches and keeps the profile's own data", () => {
    const profilesBaseDir = fixtureRoot()
    const profileDir = writeProfile(
      profilesBaseDir,
      "dev-browser-temp6-0123456789abcdef",
      [],
    )
    for (const [entry, bytes] of [
      ["component_crx_cache", 4096],
      ["ProvenanceData", 2048],
      ["Local Extension Settings", 1024],
    ] as const) {
      fs.mkdirSync(path.join(profileDir, entry), { recursive: true })
      fs.writeFileSync(path.join(profileDir, entry, "blob"), "x".repeat(bytes))
    }

    // Windows can stamp a directory slightly ahead of Date.now(), so the clock
    // is explicit instead of relying on "age is never negative".
    const result = pruneProfileCaches(profileDir, {
      now: () => Date.now() + 120_000,
      olderThanMs: 60_000,
    })
    expect(result.removed.map((entry) => entry.name)).toEqual([
      "component_crx_cache",
      "ProvenanceData",
    ])
    expect(result.freedBytes).toBe(6144)
    expect(fs.existsSync(path.join(profileDir, "component_crx_cache"))).toBe(
      false,
    )
    expect(
      fs.existsSync(path.join(profileDir, "Local Extension Settings")),
    ).toBe(true)
  })

  it("keeps caches younger than the minimum age", () => {
    const profilesBaseDir = fixtureRoot()
    const profileDir = writeProfile(
      profilesBaseDir,
      "dev-browser-temp6-0123456789abcdef",
      [],
    )
    const cache = path.join(profileDir, "component_crx_cache")
    fs.mkdirSync(cache, { recursive: true })
    fs.writeFileSync(path.join(cache, "blob"), "x".repeat(64))
    const now = Date.now()
    fs.utimesSync(path.join(cache, "blob"), now / 1000, now / 1000)

    const result = pruneProfileCaches(profileDir, {
      now: () => now,
      olderThanMs: 60_000,
    })
    expect(result.removed).toEqual([])
    expect(fs.existsSync(cache)).toBe(true)
  })

  it("deletes an orphaned profile whole and reports what it freed", () => {
    const profilesBaseDir = fixtureRoot()
    const profileDir = writeProfile(
      profilesBaseDir,
      "dev-browser-temp9-fedcba9876543210",
      [path.join(profilesBaseDir, "gone")],
    )
    expect(removeProfileDir(profileDir)).toBe(true)
    expect(fs.existsSync(profileDir)).toBe(false)
    expect(removeProfileDir(profileDir)).toBe(false)
  })

  it("formats sizes for the report", () => {
    expect(describeBytes(0)).toBe("0 B")
    expect(describeBytes(2048)).toBe("2.0 KB")
    expect(describeBytes(13.05 * 1024 ** 3)).toBe("13.05 GB")
  })
})

describe("debug browser report", () => {
  it("names each running browser with what it mounted", () => {
    const profilesBaseDir = fixtureRoot()
    const worktree = path.join(profilesBaseDir, "temp6")
    fs.mkdirSync(worktree, { recursive: true })
    const profileDir = writeProfile(
      profilesBaseDir,
      "dev-browser-temp6-0123456789abcdef",
      [worktree],
    )

    const report = formatDebugBrowserReport({
      processes: [
        { pid: 42, port: 9320, userDataDir: profileDir, extensionDirs: [] },
      ],
      profiles: classifyDevProfiles({ profilesBaseDir }),
    })
    expect(report).toContain("9320")
    expect(report).toContain("dev-browser-temp6-0123456789abcdef")
    expect(report).toContain("temp6")
  })

  it("flags browsers and profiles whose worktree is gone", () => {
    const profilesBaseDir = fixtureRoot()
    const profileDir = writeProfile(
      profilesBaseDir,
      "dev-browser-temp9-fedcba9876543210",
      [path.join(profilesBaseDir, "removed")],
    )

    const report = formatDebugBrowserReport({
      processes: [
        { pid: 7, port: 9337, userDataDir: profileDir, extensionDirs: [] },
      ],
      profiles: classifyDevProfiles({ profilesBaseDir }),
    })
    expect(report).toContain("orphan")
    expect(report).toContain("9337")
  })

  it("summarizes totals and says when there is nothing to reclaim", () => {
    const profilesBaseDir = fixtureRoot()
    writeProfile(profilesBaseDir, "dev-browser", [], { bytes: 2048 })
    const profiles = classifyDevProfiles({ profilesBaseDir })

    const report = formatDebugBrowserReport({ processes: [], profiles })
    expect(report).toContain(describeBytes(profiles[0]?.sizeBytes ?? 0))
    expect(report).toContain("没有可回收的整份 profile")
  })
})

describe("cleanup plan", () => {
  const profile = (name: string, extra: Record<string, unknown>) => ({
    name,
    dir: `/profiles/${name}`,
    worktrees: [],
    missingWorktrees: [],
    sizeBytes: 1024,
    inUse: false,
    shared: false,
    generated: true,
    orphan: false,
    ...extra,
  })

  it("reports orphans but deletes whole profiles only on request", () => {
    const profiles = [
      profile("dev-browser-temp9-0123456789abcdef", { orphan: true }),
      profile("dev-browser-temp8-fedcba9876543210", {}),
    ]
    expect(
      planProfileCleanup(profiles).deleteProfiles.map((entry) => entry.name),
    ).toEqual([])
    expect(
      planProfileCleanup(profiles, { pruneProfiles: true }).deleteProfiles.map(
        (entry) => entry.name,
      ),
    ).toEqual(["dev-browser-temp9-0123456789abcdef"])
  })

  it("never plans a running profile for either action", () => {
    const profiles = [
      profile("dev-browser-temp9-0123456789abcdef", {
        orphan: true,
        inUse: true,
      }),
    ]
    const plan = planProfileCleanup(profiles, { pruneProfiles: true })
    expect(plan.deleteProfiles).toEqual([])
    expect(plan.pruneCacheTargets).toEqual([])
    expect(plan.orphans).toEqual([])
  })

  it("offers the cache prune to every closed profile", () => {
    const profiles = [profile("dev-browser", { shared: true })]
    expect(planProfileCleanup(profiles).pruneCacheTargets).toHaveLength(1)
  })
})

describe("profile maintenance CLI", () => {
  it("prunes profiles without requiring --clean or launching a browser", () => {
    const profilesBaseDir = fixtureRoot()
    const profileDir = writeProfile(
      profilesBaseDir,
      "dev-browser-temp6-0123456789abcdef",
      [path.join(profilesBaseDir, "gone")],
    )
    const result = spawnSync(
      process.execPath,
      // --reload is a safety fallback: a regression must never launch a browser.
      ["scripts/launch-cdp-browser.mjs", "--prune-profiles", "--reload"],
      {
        encoding: "utf8",
        timeout: 10_000,
        windowsHide: true,
        env: {
          ...process.env,
          AAH_SHARED_ENV: "0",
          AAH_DEV_PROFILES_BASE_DIR: profilesBaseDir,
          AAH_DEV_PROFILE_DIR: path.join(profilesBaseDir, "unused"),
          AAH_DEV_PROFILE_PER_WORKTREE: "1",
          CDP_PORT: "1",
        },
      },
    )

    expect(result.error).toBeUndefined()
    expect(result.status, result.stderr).toBe(0)
    expect(fs.existsSync(profileDir)).toBe(false)
    expect(result.stdout).toContain("已删除孤立 profile")
  })
})

describe("recovery guidance", () => {
  it("names what a deleted profile can and cannot recover", () => {
    const profilesBaseDir = fixtureRoot()
    writeProfile(profilesBaseDir, "dev-browser", [], { bytes: 1024 })

    const report = formatDebugBrowserReport({
      processes: [],
      profiles: classifyDevProfiles({ profilesBaseDir }),
    })
    expect(report).toContain("browser:sync")
    expect(report).toContain("--cookies")
    expect(report).toContain("不可恢复")
  })
})
