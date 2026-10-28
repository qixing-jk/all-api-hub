// Reproducer: first run `pnpm browser:cdp:isolate -- --prod` in this checkout.
// Exercises the generic CLI with one synthetic account; no provider credentials
// or upstream writes are used. Fixture cleanup uses the shared account lock.
import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import path from "node:path"
import { promisify } from "node:util"

import { connectWorktreeExtension } from "../../scripts/cdp/client.mjs"
import { applyIsolateFlag } from "../../scripts/cdp/dev-profile.mjs"
import {
  getAccounts,
  withTemporaryAccount,
} from "../../scripts/cdp/sandbox.mjs"

applyIsolateFlag(["--isolate"])
const dev = await connectWorktreeExtension({
  extensionPath: path.resolve(".output/chrome-mv3"),
})
const before = await getAccounts(dev.serviceWorker)
try {
  await withTemporaryAccount(
    dev.serviceWorker,
    {
      site_type: "new-api",
      site_name: "CDP UI fixture",
      site_url: "https://cdp-ui.fixture.invalid",
      account_info: { quota: 1_000_000 },
    },
    async (account) => {
      const { stdout } = await promisify(execFile)(
        process.execPath,
        [
          "scripts/e2e-cdp-control.mjs",
          "--isolate",
          "--prod",
          "--scenario=account",
          `--account-id=${account.id}`,
        ],
        { timeout: 60_000 },
      )
      console.log(stdout)
      assert.match(stdout, /'account'.*'passed'/)
    },
  )
  try {
    await promisify(execFile)(
      process.execPath,
      [
        "scripts/e2e-cdp-control.mjs",
        "--isolate",
        "--prod",
        "--scenario=key-editor",
      ],
      { timeout: 60_000 },
    )
    assert.fail("A missing target account must not pass acceptance")
  } catch (error) {
    assert.equal(error.code, 2)
    assert.match(error.stdout, /blocked/)
    console.log(error.stdout)
  }
} finally {
  try {
    const after = await getAccounts(dev.serviceWorker)
    assert.deepEqual(
      after,
      before,
      "CLI fixture must leave saved accounts unchanged",
    )
  } finally {
    await dev.close()
  }
}
console.log(
  "Fixture account UI passed; missing-prerequisite exit 2 passed; accounts restored",
)
