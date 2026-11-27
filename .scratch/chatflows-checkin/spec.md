# ChatflowsAI check-in

Status: ready-for-agent

Scope: an additional check-in method for existing Sub2API accounts. Reuse the
Sub2API authentication lifecycle, passive discovery, mutation admission and
uncertain-result reconciliation. No hostname gate or new account site type.

The public `https://ai.chatflowsai.com/checkin/` HTML was read without credentials
on 2026-11-24. Its inline script calls `GET /api/checkin/status` and an empty-body
`POST /api/checkin` with the console's Bearer credential. The status has numeric
`code: 0` and `data.can_checkin`, `period_key`, `next_reset_at`, `checked_in_at`
and `balance`. The page defines each period as noon to noon in Asia/Shanghai;
the server's period is authoritative, including before local midnight/noon.
The submit handler treats HTTP 409 or envelope code 409 as already claimed and
reads status again; success uses `data.amount`. No timezone query is appended.

Implement independently from these protocol facts; do not copy the public page.
Local original source and hash: `artifacts/checkin-public.html` and `source.json`.
No browser session, query credential, account identity, or authenticated response
is retained here. Prior upstream reports: #1783 and #1906.

The UI calls the reward credit, without proving a USD conversion. Preserve only
the returned amount as a native credit award; never substitute the advertised 50.
Custom route overrides are not advertised because this protocol has distinct
status and mutation routes and no verified alternate deployment routes.

Validation: focused protocol, provider, registry and existing discovery tests
passed, and `pnpm compile` passed. Normal commit hooks remain required.
Real authenticated status and grant verification are owned by the main agent;
the implementation worker must not make authenticated or mutation requests.

Main-agent native UI observation: the current period was already checked, with
a disabled claim button and the next reset at noon Beijing time. This
corroborates the period semantics only; it does not establish
the raw API field types, a new grant, or extension execution. Raw API validation
remains pending. Keep this site in "missing adaptation", not verification-blocked.

The existing global daily schedule is reused to discover checked accounts and
build Chatflows reset targets. Those targets schedule a method-specific run at
the server's `nextResetAt`, when the current status read confirms the new
period is enabled and not yet checked. Users still need the global daily
schedule enabled to build targets for accounts first observed as checked.
Its settings use the computer's local timezone, not the provider's timezone.
With an Asia/Singapore or Asia/Shanghai computer clock, use fixed `13:00`
inside a `12:05`–`23:00` window, or choose a random time inside that
afternoon-only window. In other timezones, convert Beijing noon first. The
fixed time must be inside the configured window. An earlier window can still
trigger an early daily run when `pretriggerDailyOnUiOpen` is enabled; use the
afternoon window or disable that early-trigger option.

A random `09:00`–`23:00` window can hit one noon period twice on adjacent local
dates and miss another period. Browser downtime can still miss a period if the
one-shot target expires before the extension can restore and run it. This
adaptation does not rewrite the shared daily schedule or change saved user
preferences.

Cache validity uses the method registry's optional `statusPeriodKey` policy.
Only ChatflowsAI declares the noon rule; other methods retain their existing
local-day eligibility and display rules. This also expires older cached
ChatflowsAI probe/execution states using their retained observation timestamp,
without a storage migration. Expired snapshots show unknown and may enter the
batch's fresh GET path. The parser verifies both the current opening date and
its exact next-noon reset; a stale period with a distant future reset is invalid.

The regression tests first reproduced the noon cache skip and weak period
validation, then passed with the scoped policy and parser changes. Raw API
field types and live extension execution remain unverified.

Authorized execution status admission opts into the existing Sub2API auth
lifecycle, including saved refresh-token rotation and identity verification.
Discovery, ordinary status refresh and post-claim reconciliation remain passive.
The shared read-request owner carries the execution's transport policy; the
provider does not duplicate authentication or replay uncertain POSTs.
The account-list status projection uses the same registry period policy as
execution: a pre-noon observation expires at noon, while midnight within the
same noon-to-noon period does not expire it. Other methods keep local-day rules.
