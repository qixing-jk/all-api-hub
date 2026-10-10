# Native editor workflow parity

Use when adding, extending or comparing account-key or managed-resource editors. Keep their capability and write contracts separate; share this method for evaluating usability. Aim to improve common tasks and avoid regressions against the native editor within the requested scope. Field coverage alone is insufficient.

## Establish the baseline before implementation

Walk through the native editor and current extension for the target role and version before choosing fields or layout. Inspect interactions and requests, not only schemas or JSON. If live access is unavailable, use pinned native frontend source and existing evidence, continue independent work, and mark the live comparison unverified. Reuse the [evidence workflow](evidence-and-validation.md) and existing authorization boundaries.

- Follow common create, edit and reopen tasks, including materially different API/provider types, credential modes, presets and advanced settings where applicable. Record starting state, choices, controls, defaults, conditional fields, primary actions and results.
- Follow first-class collections through ordinary tasks: bulk entry, per-item editing/status/removal and selection or routing where supported. A primary secret field or pasted list does not establish multi-key management parity.
- Prioritize by frequency, importance and error cost. “Common fields only” does not justify omitting a core workflow while adding secondary settings. Respect explicit narrower user scope and record what it excludes.
- Compare existing app presentation seams with those tasks. Extend an inadequate shared editor seam when needed instead of flattening native interactions to fit its current field list.

Keep a compact comparison in the existing task spec/evidence index; rows describe tasks and meaningful variants, not individual JSON properties. Reuse it during implementation and handoff instead of creating another site inventory.

| Common task / variant | Native interaction and evidence | Our current gap | Intended behavior and priority | Observed result / remaining gap |
| --- | --- | --- | --- | --- |
| `<task and starting state>` | `<steps, defaults, source/version or capture>` | `<missing action or added effort>` | `<scope and expected improvement>` | `<comparison outcome and evidence>` |

An audit-only request ends with findings; it does not authorize implementation or resource writes. This comparison adds no approval checkpoint to already authorized work.

## Design around the task

- Put meaningful choices before their dependent inputs. Show relevant fields, help and validation for the selected type or mode; make other configured branches discoverable and restore the saved selection on reopen. Choose suitable controls rather than requiring cards or tabs everywhere.
- Place credentials and frequent actions early. Group related inputs and progressively disclose rare settings without hiding required controls. Preserve useful native bulk, search, selection and per-item operations when they are part of the common task.
- Switching type, collapsing sections or leaving a field untouched must preserve hidden values, secrets, unsupported settings and concurrent edits according to the resource owner's write contract. Do not infer protocol support, copy credentials across branches or reproduce native draft conversion without verifying its rules.
- Display native defaults accurately, including empty and zero values. Validation must lead to a visible, actionable control even when the error belongs to a collapsed or inactive branch. Retain drafts on recoverable failure and follow existing partial/uncertain-write recovery rules.

Match or improve task capability and ease, not pixels. Do not add provider-specific features to every editor or force multi-key controls onto a single-key resource.

## Compare the implementation before handoff

Replay the same representative tasks on the actual current-worktree built UI. Cover common materially different type/mode branches and single/multiple-item states where applicable, using the scoped behavior tests and live workflow required by the integration skill.

- Compare task effort: unnecessary steps, repeated entry, unrelated required fields, and native-console fallback for an in-scope core action.
- Inspect the next action, credential and primary-action placement, avoidable scrolling, grouping, defaults and misleading affordances. Check keyboard access and relevant compact widths. Follow [visual previews](visual-previews.md) and actually inspect representative images of comparable task states.
- Verify switching, save/reopen, error recovery and cancel behavior. Read back edited and untouched data from the native resource; screenshots alone cannot establish preservation or write success.
- Classify each compared task as **improved, equivalent, worse, missing or unverified**, with a short reason and evidence. Green tests do not replace this judgment. Source-backed or mocked results must remain distinguishable from live comparison.

Fix authorized core paths that are worse or missing before the first completion claim. Report unavoidable native limitations, explicit scope exclusions and unverified paths separately; do not silently lower the target or call preservation editing support. Uncommon unsupported controls may remain native-managed when their data is preserved and the limitation is clear.
