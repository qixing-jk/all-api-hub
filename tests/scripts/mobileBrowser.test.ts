import { describe, expect, it } from "vitest"

import { selectTarget } from "~~/scripts/mobile/adapters.mjs"
import {
  discoverMobileConnection,
  selectDevice,
} from "~~/scripts/mobile/discovery.mjs"

describe("mobile browser discovery", () => {
  it("requires an explicit device when several phones are connected", () => {
    const devices =
      "List of devices attached\na device model:One\nb device model:Two\nc unauthorized\n"
    expect(() => selectDevice(devices)).toThrow("--device")
    expect(selectDevice(devices, "b")).toBe("b")
    expect(() => selectDevice(devices, "c")).toThrow("unauthorized")
  })

  it("verifies the browser behind each socket and only removes owned forwards", async () => {
    const commands: string[][] = []
    let port = 21000
    const adb = async (args: string[]) => {
      commands.push(args)
      if (args.includes("/proc/net/unix"))
        return "0 @chrome_devtools_remote\n0 @chrome_devtools_remote_123\n"
      if (args.includes("tcp:0")) return String(++port)
      return ""
    }
    const readVersion = async (base: string) => ({
      "Android-Package": base.endsWith("21001")
        ? "com.microsoft.emmx.canary"
        : "com.lemurbrowser.exts",
      Browser: "test",
    })
    const connection = await discoverMobileConnection({
      device: "phone",
      browser: "lemur",
      adb,
      readVersion,
    })
    expect(connection.port).toBe(21002)
    expect(commands).toContainEqual([
      "-s",
      "phone",
      "forward",
      "--remove",
      "tcp:21001",
    ])
    await connection.close()
    expect(commands).toContainEqual([
      "-s",
      "phone",
      "forward",
      "--remove",
      "tcp:21002",
    ])
    expect(commands.flat()).not.toContain("--remove-all")
  })

  it("refuses ambiguous extension contexts rather than evaluating in the wrong one", () => {
    const targets = [
      { id: "worker", url: "chrome-extension://one/background.js" },
      { id: "a", url: "chrome-extension://one/options.html#overview" },
      { id: "b", url: "chrome-extension://two/options.html" },
    ]
    expect(selectTarget(targets)).toEqual(targets[0])
    expect(() => selectTarget(targets, "options")).toThrow("found 2")
    expect(selectTarget(targets, "options", "b")).toEqual(targets[2])
    expect(() => selectTarget(targets, "options", "unrelated")).toThrow(
      "found 0",
    )
  })
})
