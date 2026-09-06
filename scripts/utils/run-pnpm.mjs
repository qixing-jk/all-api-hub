import { execFileSync } from "node:child_process"

/**
 * Run fixed, repository-owned pnpm arguments, propagating gate failures.
 * @param args pnpm arguments, never user input or Git paths.
 */
export function runPnpm(args) {
  if (process.env.npm_execpath) {
    execFileSync(process.execPath, [process.env.npm_execpath, ...args], {
      stdio: "inherit",
    })
  } else if (process.platform === "win32") {
    execFileSync("cmd.exe", ["/d", "/s", "/c", `pnpm ${args.join(" ")}`], {
      stdio: "inherit",
    })
  } else {
    execFileSync("pnpm", args, { stdio: "inherit" })
  }
}
