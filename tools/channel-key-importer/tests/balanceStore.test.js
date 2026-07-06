import assert from "node:assert/strict"
import test from "node:test"

import { calculateBalanceUsage } from "../src/balanceStore.js"

test("calculates spend since the first successful balance query", () => {
  assert.deepEqual(calculateBalanceUsage(25, 21.375), {
    spentSinceImport: 3.625,
    balanceIncreased: false,
  })
})

test("stops estimating spend after a recharge or grant", () => {
  assert.deepEqual(calculateBalanceUsage(25, 30), {
    spentSinceImport: null,
    balanceIncreased: true,
  })
})

test("does not calculate usage from invalid balances", () => {
  assert.deepEqual(calculateBalanceUsage(Number.NaN, 10), {
    spentSinceImport: null,
    balanceIncreased: false,
  })
})
