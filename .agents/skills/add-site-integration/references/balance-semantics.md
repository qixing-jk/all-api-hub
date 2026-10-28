# Verify balance semantics

Use for adding, changing or auditing balance, allowance, currency conversion or rewards. Current code is the implementation under review; fixtures copied from it are not upstream evidence. Use the [relationship/source map](../../../../docs/agents/site-integrations.md#site-types-and-upstream-relationships) to locate primary sources.

## Establish the contract before selecting a representation

1. Enumerate requested types from `accountSiteDefinitions/definitions.ts`. For a cross-type audit, account for every registered type, including managed-only and unknown classifications. Group types only when the shared balance contract is verified; retain deployment/version exceptions.
2. Compare the target console's balance breakdown and its read-only response with official docs/source. Record origin, version/date, identity (account/team/project/key), endpoint, source field, native unit, atomic scale, remaining/used/limit role, expiry/reset and restrictions. Mark documentation-only, deployment-verified and unverified separately. A family's default or an old capture does not verify another deployment.
3. Classify each amount: purchased service credit, promotional credit, native Token/points, resetting subscription allowance, budget ceiling or debt facility. Currency denomination and fungibility are separate decisions. Non-withdrawable prepaid USD can still be monetary service credit; a published Token package price only establishes an estimate until the balance contract supports monetary treatment.
4. Record the exact conversion with a finite nonzero example. `QUOTA_PER_USD` is the product's canonical scale, not an upstream exchange rate. Read native scale from the provider contract; record configured FX and fallback separately from provider valuation. Prefer authoritative available/remaining fields over reconstructed sums. Check whether total already includes components before adding them; pool and key allocations must each be counted once.
5. Trace source → parser → account data → persistence → presentation → all affected consumers. Inspect `monetaryBalancePolicy.ts` and its callers for totals, sorting, history, income estimation and notifications, plus refresh/manual overrides and rewards. At present **any** `nativeBalance`, including USD, disables legacy monetary balance consumers. Verify both the intended inclusion/exclusion and the visible native breakdown; selecting a representation changes behavior beyond the card.

Keep this compact table in task evidence, with one row per independently meaningful amount:

| Type/deployment + evidence | Identity/source field | Asset/scale | Role + validity/scope | Conversion/example | Canonical field + label | Totals/history/income policy | Verdict/gap |
| --- | --- | --- | --- | --- | --- | --- | --- |

## Challenge the mapping

Use distinguishing examples against the verified contract before writing implementation tests:

- Purchased 10, spent 3, remaining 7: show 7, without subtracting again from a server-computed remaining field.
- Cash 2, credit limit 10, available 12: preserve the provider's available field and disclose debt capacity; never label 12 as purchased cash or add the limit twice.
- Active purchased 5, resetting allowance 20, expired allowance 9: preserve their scopes, eligibility and periods. A monthly grant/reset must not become inferred recharge income.
- Account credit 30, key budget remaining 4: a key limit is not the account balance. Moving credit between pool and keys is an internal transfer.
- Token/points with unknown conversion: retain native units; an unavailable cash value is not zero cash. For priced tokens retain the estimate's source and avoid presenting it as a cash deposit.
- Exercise finite nonzero, real zero, missing/null/malformed, signed debt where supported, inactive/expired data and refresh failure. Preserve last-known/error semantics rather than silently inventing zero. Test mixed reset periods when relevant.

For behavior repairs use red/green tests based on the independently established contract, including a final affected consumer. Documentation-only audits validate coverage, evidence and decision examples without changing runtime behavior. Report unresolved contradictions as findings with the precise missing deployment observation; do not mark a type correct because its parser test passes.
