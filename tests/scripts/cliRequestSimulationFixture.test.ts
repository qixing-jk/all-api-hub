import { spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdir, readFile, rmdir, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { expect, it } from "vitest"

it("repeated cleanup preserves its completed journal without accessing the gateway", async () => {
  const experiment = `test-cleanup-${randomUUID()}`
  const directory = path.resolve(
    ".scratch/cli-request-simulation/artifacts",
    experiment,
  )
  const journal = path.join(directory, "state.private.json")
  const state = JSON.stringify({
    baseUrl: "http://127.0.0.1:1",
    cleanedAt: "2026-10-24T00:00:00.000Z",
    ids: { outerKey: 10, bridgeKey: 11, bridgeUpstream: 12 },
    credentials: {},
    cleanup: [{ kind: "outerKey", id: 10, status: 404 }],
    sourceMembershipRestored: true,
  })
  await mkdir(directory, { recursive: true })
  await writeFile(journal, state)
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = spawnSync(
        process.execPath,
        [".scratch/cli-request-simulation/live-sub2api-fixture.mjs", "cleanup"],
        {
          encoding: "utf8",
          timeout: 5000,
          env: {
            ...process.env,
            AAH_E2E_SUB2API_BASE_URL: "http://127.0.0.1:1",
            AAH_E2E_SUB2API_ADMIN_TOKEN: "synthetic-admin",
            AAH_CLI_PROFILE_EXPERIMENT: experiment,
          },
        },
      )
      expect(result.stderr).toBe("")
      expect(result.status).toBe(0)
      expect(await readFile(journal, "utf8")).toBe(state)
    }
  } finally {
    await unlink(journal)
    await rmdir(directory)
  }
})
