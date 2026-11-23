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

The existing global daily schedule is reused. It does not add an extra run at
the provider's noon reset; choose a schedule after noon Beijing time when the
desired behavior is to claim the newly opened period the same calendar day.
