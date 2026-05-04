## Why

Operators who import multiple public-benefit channels into their own New API-compatible managed site need more than name matching to keep usable models: a model can be listed by a channel but still fail text generation, tool calling, or structured-output requests. Channel sync should be able to filter models by live capability probes so synced channel model lists reflect the behaviors the operator actually needs.

## What Changes

- Add probe-backed model filter rules for managed-site channel synchronization, alongside the existing pattern-based include/exclude rules.
- Allow a rule to test individual models against selected API verification probes such as text generation, tool calling, structured output, and other supported reusable probes.
- Allow probe rules to be added from channel-level filter editing and global channel model sync settings, with clear include/exclude semantics when combined with existing pattern rules.
- Execute probe rules with the target channel's own `base_url` and channel key instead of collecting separate manual credentials or caching copied credentials from channel creation.
- Provide recoverable guidance when the channel key cannot be resolved for probing, reusing existing managed-site key reveal or verification recovery paths where available.
- Preserve secret safety for channel keys used by probe rules, including masked UI display and redaction from errors, toasts, logs, and diagnostics.
- Keep existing pattern filters working for current users without migration-breaking behavior.

## Capabilities

### New Capabilities

- `managed-site-channel-probe-filters`: Defines probe-backed channel model filter rules, channel-key-based probe execution, rule composition, recoverable key-unavailable behavior, and secret-safe feedback for managed-site channel synchronization.

### Modified Capabilities

- None.

## Impact

- Affected UI surfaces include managed-site channel filter editing, global managed-site model sync settings, and any shared channel filter editor components.
- Affected service logic includes managed-site model synchronization, channel filter rule typing/storage, channel key resolution, channel configuration persistence, and runtime messages used to load or save channel filters.
- Affected verification logic includes reusing existing API verification probe runners for per-model filtering without changing the standalone API Verification behavior.
- Affected data handling includes storing probe-rule metadata while ensuring raw channel keys are not exposed in logs, diagnostics, or user-facing fallback messages.
