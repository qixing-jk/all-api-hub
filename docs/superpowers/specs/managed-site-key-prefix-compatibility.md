# Site Key Prefix Compatibility Evidence

Date: 2026-05-18

## Decision

Treat `sk-` as an optional identity prefix only for One API/New API compatible
site types or for backends with source-confirmed matching token authentication.
Do not apply this rule globally to arbitrary API keys, API credential profiles,
provider keys, or unconfirmed channel keys.

In this codebase, channel matching defaults to exact key comparison. One API,
New API, AnyRouter, Veloera, OneHub, DoneHub, `v-api`, VoAPI, Super-API,
Rix-Api, Neo-API, and WONG公益站 may use optional `sk-` prefix comparison
when direct upstream source, local adapter behavior, repository compatibility
policy, or site-specific deployment observations confirm matching token
authentication. Among current managed-site providers, this rule is exercised by
New API, Veloera, and DoneHub.

## Source Review Summary

| Gateway | Upstream source reviewed | Optional `sk-` auth prefix with bare stored key | Confidence | Notes |
| --- | --- | --- | --- | --- |
| New API | Previously known from New API source behavior and local adapter evidence | Yes | High | Token auth accepts optional `sk-`; key inventory may be bare or masked. |
| One API | `songquanpeng/one-api` | Yes | High | `middleware/auth.go` strips `Bearer ` and `sk-` before token validation; token create/model paths store bare keys. |
| AnyRouter | User-tested deployment behavior plus local adapter review | Yes by deployment-tested behavior | Medium | User testing confirmed optional `sk-` token matching on a compatible deployment. The local adapter reuses common One/New API account helpers with AnyRouter-specific check-in overrides. |
| Veloera | `Veloera/Veloera` | Yes | High | `middleware/auth.go` strips `Bearer ` and `sk-` before token validation; `controller/token.go` stores the generated key directly in `Token.Key`, and `model/token.go` validates the stripped key by exact lookup. |
| OneHub | `MartialBE/one-hub` | Yes | High | `middleware/auth.go` strips `Bearer ` and `sk-`; token model/create paths return stored key values. |
| DoneHub | `deanxv/done-hub` | Yes | High | `middleware/auth.go` strips `Bearer ` and `sk-`; generated token keys are stored bare and token responses do not add `sk-`. |
| v-api | `AGENTS.md` compatibility relationship | Yes by One API/New API-family compatibility | Medium | Documented as based on One API with some New API functionality. Exact deployment depth can vary. |
| VoAPI | `AGENTS.md` compatibility relationship | Yes for older compatible deployments | Medium | Older VoAPI support is treated as New API-family compatibility; newer VoAPI may be incompatible without target verification. |
| Super-API | `AGENTS.md` compatibility relationship | Yes by New API-family compatibility | Medium | Documented as a New API-family variant or compatibility bucket; deployment modifications can vary. |
| Rix-Api | `AGENTS.md` compatibility relationship | Yes by New API-family compatibility | Medium-low | Treated as a New API-family compatibility bucket in this repo; no single upstream is assumed. |
| Neo-API | `AGENTS.md` compatibility relationship | Yes by New API-family compatibility | Medium-low | Treated as a New API-family compatibility bucket in this repo; no single upstream is assumed. |
| WONG公益站 | User-tested deployment behavior plus local adapter review | Yes by deployment-tested behavior | Medium | User testing confirmed optional `sk-` token matching on a compatible deployment. The local adapter reuses common One/New API account helpers with WONG-specific check-in and token-key reveal overrides. |
| Sub2API | `Wei-Shaw/sub2api` at `1d78dde8c414932a365c43985477d52eab044fbd` | No | High | Auth middlewares pass the full key to `GetByKey`; repository uses exact `apikey.KeyEQ(key)`. Random keys may be generated with `sk-`, but that prefix is part of the key. |
| Octopus | `bestruirui/octopus` `dev` branch | No | High | Channel keys are stored, listed, and forwarded as-is. `sk-octopus-*` is a strict Octopus public API key format, not a channel key equivalence rule. |
| AxonHub | `looplj/axonhub` `unstable` branch | No evidence found | Medium-high | Reviewed header extraction and channel credential structs. Header code strips transport prefixes such as `Bearer `, not a business-key `sk-` prefix. |
| Claude Code Hub | `ding113/claude-code-hub` provider management files | No evidence found for provider keys | Medium | Provider key management uses masked display plus reveal. The review covered provider management paths, not every possible client auth path. |
| AIHubMix | Closed source | Not source-confirmed | Not applicable | AIHubMix is closed source; observed keys are already `sk-` prefixed, so no optional-prefix normalization is justified from source evidence. |

## Reviewed Upstream Files

Repository compatibility policy:

- AGENTS.md: `v-api` is a One API derivative/New API-compatible bucket; older
  VoAPI, Super-API, Rix-Api, and Neo-API are treated as New API-family variants
  or compatibility buckets.

One API:

- https://github.com/songquanpeng/one-api/blob/main/middleware/auth.go
- https://github.com/songquanpeng/one-api/blob/main/controller/token.go
- https://github.com/songquanpeng/one-api/blob/main/model/token.go

OneHub:

- https://github.com/MartialBE/one-hub/blob/main/middleware/auth.go
- https://github.com/MartialBE/one-hub/blob/main/controller/token.go
- https://github.com/MartialBE/one-hub/blob/main/model/token.go

DoneHub:

- https://github.com/deanxv/done-hub/blob/main/middleware/auth.go
- https://github.com/deanxv/done-hub/blob/main/model/token.go
- https://github.com/deanxv/done-hub/blob/main/common/user-token.go
- https://github.com/deanxv/done-hub/blob/main/controller/token.go
- https://github.com/deanxv/done-hub/blob/main/model/channel.go
- https://github.com/deanxv/done-hub/blob/main/controller/channel.go

Veloera:

- https://github.com/Veloera/Veloera/blob/main/middleware/auth.go
- https://github.com/Veloera/Veloera/blob/main/controller/token.go
- https://github.com/Veloera/Veloera/blob/main/model/token.go

Sub2API:

- https://github.com/Wei-Shaw/sub2api/blob/1d78dde8c414932a365c43985477d52eab044fbd/backend/internal/server/middleware/api_key_auth.go
- https://github.com/Wei-Shaw/sub2api/blob/1d78dde8c414932a365c43985477d52eab044fbd/backend/internal/server/middleware/api_key_auth_google.go
- https://github.com/Wei-Shaw/sub2api/blob/1d78dde8c414932a365c43985477d52eab044fbd/backend/internal/service/api_key_service.go
- https://github.com/Wei-Shaw/sub2api/blob/1d78dde8c414932a365c43985477d52eab044fbd/backend/internal/repository/api_key_repo.go

Octopus:

- https://github.com/bestruirui/octopus/blob/dev/internal/model/channel.go
- https://github.com/bestruirui/octopus/blob/dev/internal/op/channel.go
- https://github.com/bestruirui/octopus/blob/dev/internal/helper/fetch.go
- https://github.com/bestruirui/octopus/blob/dev/internal/server/middleware/auth.go
- https://github.com/bestruirui/octopus/blob/dev/README.md

AxonHub:

- https://github.com/looplj/axonhub/blob/unstable/internal/server/middleware/header.go
- https://github.com/looplj/axonhub/blob/unstable/internal/objects/channel.go

Claude Code Hub:

- https://github.com/ding113/claude-code-hub/blob/main/src/actions/providers.ts
- https://github.com/ding113/claude-code-hub/blob/main/src/app/api/v1/resources/providers/handlers.ts

## Implementation Rules

- Preserve backend-provided key values for storage, display, copy, and request
  payloads unless a provider-specific adapter has an explicit reason to
  transform them.
- Use optional `sk-` prefix comparison only in identity checks for
  source-confirmed compatible backends, documented compatibility buckets, and
  site-specific compatible deployments with user-tested `sk-` token matching:
  One API, New API, AnyRouter, Veloera, OneHub, DoneHub, `v-api`, VoAPI,
  Super-API, Rix-Api, Neo-API, and WONG公益站.
- Use exact key comparison for Sub2API, Octopus, AxonHub, Claude Code Hub,
  AIHubMix, and source-unknown API credentials.
- Do not strip One API `-channelId` or OneHub `#channelId` suffixes in this
  codebase unless implementing a dedicated parser for those upstream routing
  syntaxes; those suffixes can change routing semantics.

## Verification

An independent re-review of the upstream files above reached the same gateway
classification. The only caveat was Claude Code Hub: the conclusion is scoped
to provider key management paths because the review did not exhaustively cover
all client authentication and proxy forwarding paths.
