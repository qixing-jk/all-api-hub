import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"

import { NANOGPT_API_ORIGIN } from "../../../src/services/accountSiteDefinitions/identifiers.ts"
import { NANOGPT_ENDPOINTS } from "../../../src/services/apiService/nanogpt/constants.ts"

/** Stateless direct-host reads: no console cookies, redirects, writes or paid inference. */
export async function readNanoGptCredential(apiKey) {
  assert.ok(apiKey, "missing_api_key")
  const read = async (endpoint, method = "GET") => {
    const response = await fetch(`${NANOGPT_API_ORIGIN}${endpoint}`, {
      method,
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(30000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    })
    assert.equal(
      response.status,
      200,
      `NanoGPT ${endpoint} returned ${response.status}`,
    )
    return await response.json()
  }
  const balance = await read(NANOGPT_ENDPOINTS.checkBalance, "POST")
  assert.ok(
    typeof balance.nanoDepositAddress === "string" &&
      balance.nanoDepositAddress.trim(),
    "No credential-owned account identity",
  )
  assert.ok(
    balance.usd_balance !== null &&
      balance.usd_balance !== undefined &&
      String(balance.usd_balance).trim() &&
      Number.isFinite(Number(balance.usd_balance)) &&
      Number(balance.usd_balance) >= 0,
    "No authoritative USD balance",
  )
  const usage = await read(NANOGPT_ENDPOINTS.usage)
  assert.ok(
    usage.totals &&
      Number.isFinite(usage.totals.requests) &&
      Number.isFinite(usage.totals.totalTokens),
    "No key-scoped usage totals",
  )
  assert.ok(
    Number.isFinite(usage.totals.netCostUsd ?? usage.totals.costUsd),
    "No usable usage cost",
  )
  const subscription = await read(NANOGPT_ENDPOINTS.subscriptionUsage)
  assert.equal(typeof subscription.active, "boolean", "No subscription state")
  return { balance, usage, subscription }
}

export async function runNanoGptProbe({ apiKey, evidenceDir }) {
  const response = await fetch(
    `${NANOGPT_API_ORIGIN}${NANOGPT_ENDPOINTS.detailedModels}`,
    {
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    },
  )
  assert.equal(response.status, 200, "Public detailed catalog unavailable")
  const catalog = await response.json()
  assert.ok(
    Array.isArray(catalog.data) && catalog.data.length,
    "No public models",
  )
  assert.ok(
    catalog.data.some((model) => model.pricing?.currency === "USD"),
    "No published USD pricing",
  )
  await fs.writeFile(
    path.join(evidenceDir, "public-catalog.json"),
    JSON.stringify(catalog, null, 2),
  )
  if (!apiKey)
    return {
      skipped: true,
      reason:
        "public catalog passed; missing_api_key for live balance/usage/subscription",
    }
  const credential = await readNanoGptCredential(apiKey)
  await fs.writeFile(
    path.join(evidenceDir, "credential-readback.json"),
    JSON.stringify(credential, null, 2),
  )
  return { ok: true }
}
