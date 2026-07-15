# Model Vendor Classification Design

Date: 2026-07-14

## Purpose

Modernize Model List vendor classification without assuming that displayed
model names are canonical model IDs or that every account site uses a New API
pricing response.

For users, this classification means the model's canonical product or brand
ownership: the identity under which they recognize and select the model. It
does not mean the API host, routing gateway, uploader, or necessarily the
legal creator of every base-model component.

The design adds a site-neutral model descriptor and vendor-evidence contract,
normalizes native backend facts inside adapter capabilities, shares model
identity matching across metadata consumers, and retains deterministic family
rules for non-standard or unlisted model names.

## Current Context

Model List already downloads `https://models.dev/models.json` through
`ModelMetadataService`. The metadata is attached to calculated rows and drives
capability filters and badges, but vendor tabs, counts, and row icons still use
the static regular expressions in
`src/services/models/utils/modelProviders.ts`.

There are also duplicated identity matchers:

- `ModelMetadataService` maintains lookup maps and fuzzy matching for model
  normalization and model redirect generation.
- `src/features/ModelList/modelCapabilityFilters.ts` builds a separate,
  conflict-aware metadata index.
- vendor classification maintains a third model-name pattern set.

The current vendor taxonomy mixes publishers, model families, and serving
platforms. Claude, Gemini, and Grok are product families; Ollama and Azure are
serving platforms; Llama is currently classified as Ollama even though its
publisher is Meta.

## Existing Capability Architecture

The existing cross-site ownership split remains authoritative:

- `SiteAdapter.modelPricing` fetches and normalizes account-level pricing
  facts.
- `SiteAdapter.modelCatalog` fetches runtime-key model catalogs for sources
  without account-level pricing.
- `src/services/modelList/accountSources/readiness.ts` combines adapter facts
  with account-site product profiles and selects the direct-pricing,
  token-scoped-catalog, or unsupported route.
- `src/services/modelList/accountSources/` owns account-source fallback and
  estimate assembly.
- `src/services/apiCredentialProfiles/modelCatalog.ts` owns saved API
  credential profile discovery.
- Model List hooks own UI state, caching, filtering, sorting, and analytics.

Vendor classification must deepen these boundaries rather than bypass them.
The UI must never branch on `siteType` or parse a backend-native vendor
registry.

## Upstream Findings

The design uses several upstreams to identify available facts, not to define a
New API-shaped product contract.

### New API

At `QuantumNous/new-api` commit
`7c28993f6bd9e92616f3f578212577f8b7c40b45`:

- `/api/pricing` may return model-level `vendor_id` values plus a top-level
  `vendors` registry.
- persisted model metadata supports exact, prefix, contains, and suffix name
  rules, allowing deployments to classify non-standard names.
- missing model metadata falls back to static substring rules.
- `/v1/models.owned_by` is derived from the preferred channel adapter, so it
  describes routing rather than necessarily identifying the publisher.
- the legacy `/api/pricing.owner_by` field is declared but not populated by
  the current implementation.

References:

- `model/pricing.go`
  <https://github.com/QuantumNous/new-api/blob/7c28993f6bd9e92616f3f578212577f8b7c40b45/model/pricing.go>
- `model/model_meta.go`
  <https://github.com/QuantumNous/new-api/blob/7c28993f6bd9e92616f3f578212577f8b7c40b45/model/model_meta.go>
- `model/pricing_default.go`
  <https://github.com/QuantumNous/new-api/blob/7c28993f6bd9e92616f3f578212577f8b7c40b45/model/pricing_default.go>
- `controller/model.go`
  <https://github.com/QuantumNous/new-api/blob/7c28993f6bd9e92616f3f578212577f8b7c40b45/controller/model.go>
- `controller/pricing.go`
  <https://github.com/QuantumNous/new-api/blob/7c28993f6bd9e92616f3f578212577f8b7c40b45/controller/pricing.go>

### One API And OneHub

At `songquanpeng/one-api` commit
`8df4a2670b98266bd287c698243fff327d9748cf`, `owned_by` comes from adapter or
channel names and unknown custom models use `custom`.

At `MartialBE/one-hub` commit
`387f8bf16ed0d601fdede7ade378adb10aa1a35a`, ownership comes from a price
record's channel type and an editable `model_owned_by` registry. It is a useful
deployment hint but not an immutable publisher fact.

References:

- One API `controller/model.go`
  <https://github.com/songquanpeng/one-api/blob/8df4a2670b98266bd287c698243fff327d9748cf/controller/model.go>
- OneHub `relay/model.go`
  <https://github.com/MartialBE/one-hub/blob/387f8bf16ed0d601fdede7ade378adb10aa1a35a/relay/model.go>
- OneHub `model/model_ownedby.go`
  <https://github.com/MartialBE/one-hub/blob/387f8bf16ed0d601fdede7ade378adb10aa1a35a/model/model_ownedby.go>

### AIHubMix And Catalog-Only Sources

The repository's AIHubMix integration receives `developer_name`, `developer`,
`owner_by`, and `developer_id` catalog fields. These can express publisher
evidence more directly than the legacy generic `owner_by` field.

Sub2API, SharedChat, and saved API credential profiles currently expose only
model IDs through their catalog paths. They must continue to work without any
adapter-provided vendor evidence.

### models.dev

At `anomalyco/models.dev` commit
`a0bcde206aca955d3169405dd3baa08b044d091a`, family is a controlled metadata
vocabulary, not a guarantee that every value is safe as a textual classifier.
The vocabulary includes short and generic values, so the extension uses it
only as metadata attached to an already resolved record.

The live `models.json` snapshot reviewed on 2026-07-16 contains 255 canonical
`<lab>/<model>` records across 23 lab prefixes. The official SDK type describes
the dataset as provider-agnostic model metadata keyed by that canonical ID.
This supports treating an exact known lab prefix as weak product/brand
evidence, but the runtime resolver remains driven by its local curated aliases;
it does not download the snapshot to build prefix policy. Known snapshot
prefixes map through existing aliases, while unconfigured prefixes such as
`poolside` and `sakana` remain Unknown.

References:

- schema
  <https://github.com/anomalyco/models.dev/blob/a0bcde206aca955d3169405dd3baa08b044d091a/packages/core/src/schema.ts>
- family vocabulary
  <https://github.com/anomalyco/models.dev/blob/a0bcde206aca955d3169405dd3baa08b044d091a/packages/core/src/family.ts>
- live model metadata <https://models.dev/models.json>
- SDK model types
  <https://github.com/anomalyco/models.dev/blob/dev/packages/sdk/src/types.ts>

## Goals

- Classify Model List rows by publisher/vendor rather than mixing publishers,
  model families, and serving platforms.
- Let every adapter expose optional vendor evidence through one site-neutral
  contract.
- Preserve the different semantics of publisher, deployment-category, and
  routing-provider evidence without presenting arbitrary deployment labels as
  publishers.
- Continue classifying non-standard model names through normalized metadata,
  conservative alias matching, and curated fallback rules.
- Allow vendors present in current rows to create vendor tabs dynamically.
- Let users isolate unresolved rows through a conditional Unclassified filter
  without turning that UI sentinel into a vendor identity.
- Share model metadata lookup and ambiguity handling across Model List,
  metadata normalization, and model redirect/sync behavior.
- Preserve model redirect protections against version changes and ambiguous
  aliases.
- Ensure a future site type can supply vendor evidence in its adapter without
  changing Model List UI or the vendor resolver.

## Non-Goals

- Do not expose New API's `vendor_id + vendors` wire shape to Model List.
- Do not treat every upstream `owned_by` value as a model publisher.
- Do not expose a source-provider filter in this change.
- Do not infer verification protocol from model vendor.
- Do not change single-model or batch-verification protocol selection.
- Do not rewrite Model List readiness, the sync scheduler, or channel
  model-mapping algorithms.
- Do not persist models.dev metadata in browser storage.
- Do not add user-managed vendor rules to the extension.
- Do not load arbitrary upstream icon URLs.
- Do not automatically turn models.dev family vocabulary into text-matching
  rules.
- Do not guarantee classification for opaque model names when no trustworthy
  evidence or rule exists.

## Terminology

- **Model vendor**: the canonical product or brand ownership under which users
  recognize and select the model, such as OpenAI, Anthropic, Google, Meta, or
  Alibaba. It is usually the publisher or project brand, not the hosting route
  and not necessarily every underlying model creator.
- **Source provider**: a gateway, adapter, or deployment route serving the
  model, such as OpenRouter, Azure, or SiliconFlow.
- **Model family**: a product family used to recognize related IDs, such as
  Claude, Gemini, Grok, Qwen, Llama, or Gemma.
- **Vendor evidence**: a normalized optional fact supplied by an adapter and
  tagged with its backend semantics before leaving that adapter boundary.
- **Deployment category**: a vendor label configured by a deployment. It is an
  explicit deployment fact but not necessarily an objective publisher fact.
- **Vendor key**: a namespaced UI/filter identity. Known publishers and custom
  publishers never share the same key space.
- **Unclassified row**: a row whose resolver result is `unknown`; this is a
  row state rather than a vendor identity.
- **Filter sentinel**: a UI-only selection such as `filter:all` or
  `filter:unclassified`; sentinels share the filter-value type but are not
  vendor keys.

## Architecture

### 1. Add A Shared Model Descriptor Contract

Add a neutral model-domain contract under `src/services/models/`:

```ts
export const MODEL_VENDOR_EVIDENCE_KINDS = {
  Publisher: "publisher",
  DeploymentCategory: "deployment_category",
  RoutingProvider: "routing_provider",
} as const

export interface ModelVendorEvidence {
  kind: ModelVendorEvidenceKind
  name: string
  externalId?: string
}

export interface ModelDescriptor {
  id: string
  vendorEvidence?: ModelVendorEvidence
}
```

The exact names may be refined in the implementation plan, but these semantics
are required. `externalId` is opaque and response-local; UI filtering never
uses it as a canonical vendor ID.

`ModelPricing` gains an optional row-level `vendorEvidence`. It does not gain
New API fields such as `vendor_id`, and `PricingResponse` does not expose a
native `vendors` registry.

### 2. Strengthen Model Catalog Capability

Change `ModelCatalogCapability.fetchModels(...)` from `Promise<string[]>` to
`Promise<ModelDescriptor[]>`.

Existing adapters remain simple:

- Sub2API maps each returned ID to `{ id }`.
- SharedChat maps each returned ID to `{ id }`.
- saved API credential profile model IDs are converted to `{ id }` before
  building a catalog-only pricing response.

`buildModelListCatalogPricingResponse(...)` accepts descriptors and copies
optional `vendorEvidence` into the canonical `ModelPricing` rows.

Catalog normalization trims IDs and deduplicates exact IDs. When duplicate
descriptors carry identical evidence, the evidence is retained. When they
carry conflicting evidence, the model remains in the catalog but its evidence
is dropped as ambiguous; array order never selects a winner.

The descriptor migration covers the full token-scoped path:

- `runtimeKeyFallback.ts` passes descriptors rather than string IDs;
- Sub2API estimate lookup may extract `descriptor.id` for price-table matching;
- successful estimates merge calculated pricing back onto descriptor-backed
  rows;
- missing dashboard authentication and estimate-failure responses retain the
  original descriptor evidence.

This change gives a future catalog-only adapter a stable place to preserve
publisher facts without widening Model List or inventing a new capability.

### 3. Normalize Native Evidence Inside Adapters

Each adapter translates native wire fields before returning the product-owned
model contract:

- **New API default pricing**: parse the raw `/api/pricing` DTO, validate the
  response-level registry, join each `vendor_id`, and emit row-level
  `DeploymentCategory` evidence. The resolver uses this evidence only when its
  normalized name maps to a curated known publisher alias; arbitrary
  administrator categories do not become publisher tabs. Older New API
  deployments and forks may omit these fields and must continue without
  evidence.
- **OneHub and DoneHub pricing overrides**: retain `owned_by` only as
  `RoutingProvider` evidence after normalization. Their native response is not
  forced into a New API vendor registry.
- **AIHubMix pricing**: normalize before the current fields collapse into
  `owner_by`. A non-empty `developer_name` or `developer` produces Publisher
  evidence. `owner_by` is RoutingProvider evidence unless an authoritative
  backend contract proves publisher semantics. When a displayable developer
  name creates Publisher evidence, its associated `developer_id` may populate
  that evidence's opaque `externalId`. Without a displayable developer name,
  a standalone `developer_id` is discarded and no evidence is emitted. It is
  never attached to fallback `owner_by` RoutingProvider evidence.
- **Sub2API, SharedChat, and credential profiles**: return descriptors without
  vendor evidence unless their backend contract later provides a trustworthy
  field.

No resolver or UI module imports these native DTO fields or checks `siteType`.
No new `modelVendorCatalog` capability is added because evidence belongs to
the existing pricing or catalog response lifecycle.

When external backend semantics determine these mappings, adapter code records
the pinned upstream source and the exact field contract in a concise comment.

### 4. Extract A Shared Model Identity Index

Add a pure service-layer module under
`src/services/models/modelMetadata/` that owns metadata lookup mechanics.

The index records:

- exact full IDs and names;
- models.dev provider-qualified IDs;
- extracted bare IDs and names;
- date-normalized and token-normalized aliases;
- metadata family values retained on resolved records;
- ambiguous keys mapping to more than one metadata record or provider.

The public lookup returns evidence rather than silently selecting a winner. It
distinguishes exact, normalized-alias, ambiguous, and unmatched outcomes.

Only an exact catalog match may trust a provider-qualified metadata ID. The
resolver must not generally treat the first path segment of an arbitrary
displayed model ID as a publisher; values such as `openrouter/...` or
`azure/...` may be routing namespaces. An exact curated alias that remains
eligible for weak evidence may provide a final prefix fallback under the
strict rules below.

The shared module owns normalization and ambiguity detection only. Consumer
policy remains explicit:

- Model List capabilities accept exact and unambiguous normalized aliases.
- vendor classification consumes the provider of an already resolved metadata
  record. Family values do not independently resolve an unmatched model.
- model redirect receives the raw model ID before `extractActualModel` or date
  removal. An explicitly dated input may use an exact raw-ID match only; it
  never enters normalized alias lookup. Undated inputs may use the existing
  conservative alias path. Redirect generation additionally retains the
  version-token equality guard.

models.dev family vocabulary is not converted into runtime matching rules.
Unique provider ownership does not make short or generic values such as `o`,
`Hy`, `north`, `auto`, `command`, or `v0` lexically safe. A family name may
appear in the curated fallback table only after explicit review, boundary
definition, and negative tests.

`ModelMetadataService` remains responsible for download, cache lifetime,
fallback initialization, and logging. It delegates lookup construction and
queries to the shared index. `modelCapabilityFilters.ts` stops defining its
own metadata index.

### 5. Add A Site-Neutral Model Vendor Resolver

The resolver accepts only:

- `ModelDescriptor` or the equivalent pricing row;
- an optional resolved metadata record;
- the shared metadata/family index;
- curated fallback rules.

For one row it returns a pure vendor candidate containing a stable vendor key,
display-label candidate, and classification source. It has no React, icon,
styling, account, site-type, readiness, or transport dependency.

Known providers use curated canonical IDs and labels. Publisher evidence is
terminal. Exact known metadata aliases are also terminal, including verified
official organization aliases that are deliberately strong-only evidence.
These aliases are accepted for Publisher and metadata resolution but are not
automatically eligible as deployment, routing, or model-ID prefix evidence.

Unconfigured Publisher evidence or metadata providers receive a deterministic
custom identity from their normalized display name. Custom metadata remains
custom even when the displayed model ID embeds a broad base-family name. It may
be replaced only when one unambiguous curated candidate comes from an explicit
qualified-family, controlled-product, or attribution policy for that product.
For example, `utter-project/EuroLLM-*` is EuroLLM, while a custom
`NousResearch` metadata record for a Hermes-Llama derivative remains
`NousResearch`. Remote icons are not used.

Strong and weak alias registries validate normalized aliases during module
initialization. Repeated aliases for the same canonical vendor are permitted;
a normalized alias shared by different vendors is a deterministic
configuration error rather than an order-dependent last-write-wins choice.

Vendor keys use distinct namespaces:

- `known:<canonical-id>` for curated publishers;
- `custom:<encoded-normalized-name>` for unconfigured publisher evidence or
  metadata publishers;
- `filter:all` for the All UI sentinel;
- `filter:unclassified` for the UI-only unresolved-row sentinel.

`unknown` remains a resolver result state and never becomes a vendor key. The
separate `filter:unclassified` sentinel may select those rows in Model List;
it does not participate in vendor aggregation or identity. `externalId` is
never part of a vendor key because it is response-local.

Custom-name normalization uses Unicode NFKC, trimming, internal-whitespace
collapse, and case folding. It does not collapse arbitrary punctuation into
hyphens, so distinct names do not accidentally share a slug. Known aliases are
resolved before custom keys are created.

A separate row-aggregation step groups candidates by vendor key and builds the
canonical vendor catalog for the current Model List dataset. If several raw
labels normalize to the same custom key, this aggregation step selects the
display label by locale-independent code-point ordering. It then maps every
row with that key to the same canonical descriptor. The per-row resolver never
attempts a cross-row choice without dataset context.

A feature-local Model List presentation registry maps the pure resolved vendor
to semantic mark data. Known publishers use the icon library's Color/Mono
assets through direct ESM imports; known vendors without a library asset use
an explicit one- or two-letter monogram. Custom vendors use the local generic
CPU mark, while unresolved rows and the Unclassified tab use a help/question
mark. `ModelVendorMark` renders compact and badge variants; the project owns
only the neutral badge surface and local fallbacks, not brand colors or logo
backgrounds. Remote icon URLs are never loaded.

Tab labels use publisher names. Claude, Gemini, Grok, Qwen, Llama, and Gemma
remain model-family aliases rather than vendor labels.

### 6. Resolve Vendor Evidence In A Fixed Order

Resolve each row once and attach the result to the raw and calculated Model
List row. Filtering, counts, tabs, and row icons consume the same result.

The order is:

1. **Adapter publisher evidence**: a validated Publisher fact such as an
   AIHubMix developer.
2. **Metadata arbitration**: exact known metadata is terminal. Exact custom
   metadata remains custom unless one explicit qualified, controlled, or
   attribution product policy identifies the model as a known product.
3. **Curated fallback rule**: deterministic rules for unlisted or transformed
   names.
4. **Known deployment-category alias**: only after a true curated no-match, a
   deployment label is accepted when its normalized name maps to a curated
   publisher. Arbitrary categories remain non-publisher deployment facts and
   do not create vendor tabs.
5. **Recognized routing-provider evidence**: only after a true curated
   no-match, a routing value is accepted when the normalized value itself
   names a known publisher. Gateway values, numeric values, `custom`,
   `unknown`, and localized unknown sentinels are ignored.
6. **Unknown**: no guess is made when evidence is absent or ambiguous.

Rules never depend on object or map iteration order. More specific patterns
are evaluated before broad patterns; a tie across vendors is ambiguous rather
than first-match-wins.

Internally, curated resolution distinguishes a single candidate, ambiguity,
and no-match even though the public convenience resolver flattens ambiguity
and no-match to Unknown. Weak deployment and routing evidence is considered
only for no-match. Curated ambiguity is terminal and cannot be converted into
a vendor by weak evidence.

Inside the curated fallback, product-leading family, bare-family,
qualified-family, and controlled exact-ID rules run first. Embedded base-family
tokens are considered only as conflict evidence after a leading, qualified, or
controlled candidate already exists. They do not create ownership for an
unknown-leading derivative. For example, Hermes-Llama, OpenHermes-Mistral, and
Dolphin-Mistral derivatives remain Unknown without metadata, while leading
Llama, Qwen, Mistral, and DeepSeek product IDs retain their normal ownership.

Only when direct candidates are empty may an exact known vendor or brand alias
before `/` seed a fallback candidate. The ID must be a well-formed two-segment
`prefix/model` identity after existing tail routing-decoration removal. Prefix
matching reuses the curated weak-alias normalization: NFKC, trimming,
whitespace collapsing, and case folding. It remains exact after normalization;
it does not collapse punctuation, decode percent escapes, accept empty
segments, or search nested paths. The seeded candidate then goes through the
same suffix-family and ambiguity expansion as direct matches. In a derived
multi-vendor tie, an eligible exact prefix may select its vendor only when that
vendor is already a natural candidate and no competing vendor exists solely
as an ambiguity signal. This permits corroborating prefixes such as NVIDIA for
Nemotron-Llama, Deep Cogito for Cogito-Qwen/Llama/DeepSeek, and DeepSeek for
R1-Distill-Qwen/Llama. It cannot break combinations such as GPT-Claude.

The model tail remains an opaque display identity and may contain internal or
segment-leading whitespace, including spaces produced by NFKC normalization.
Whole-ID trimming removes outer trailing whitespace; otherwise the tail is
accepted when `tail.trim()` is non-empty. A Unicode replacement character,
including one produced while repairing an unpaired UTF-16 surrogate, rejects
the prefix fallback rather than attributing malformed input.

### 7. Curated Fallback Scope

The curated table updates current rules and, at minimum, covers:

- OpenAI: GPT, o-series, ChatGPT, DALL-E, Whisper, embeddings, and current
  OpenAI image/audio families;
- Anthropic: Claude, Sonnet, Haiku, and Opus with token boundaries;
- Google: Gemini, Gemma, Imagen, and related Google model families;
- Meta: Llama;
- Alibaba: Qwen and Tongyi;
- xAI: Grok;
- DeepSeek, Mistral, Moonshot/Kimi, Zhipu/GLM, MiniMax, Cohere,
  Tencent/Hunyuan, Baidu/ERNIE, Baichuan, Yi, Doubao, NVIDIA/Nemotron,
  Xiaomi/MiMo, StepFun, Perplexity/Sonar, and other current unambiguous
  models.dev families.

Patterns such as `/yi/i`, `/o\d+/i`, and unrestricted `sonnet` substring
matching become boundary-aware. Ollama and Azure are removed from the
model-vendor taxonomy.

Exact known vendor and brand aliases are also eligible for the prefix fallback
unless their definition disables weak alias evidence. Brand prefixes such as
Qwen, Claude, Gemini, Llama, Kimi, GLM, Sonar, and MiMo are valid; the prefix
does not need to be a legal organization name. Verified official organization
aliases such as `zai-org`, `CohereLabs`, `Tencent-Hunyuan`, `baichuan-inc`,
`ByteDance-Seed`, `stepfun-ai`, `deepreinforce-ai`, `inceptionai`, `sarvamai`,
and `OpenSenseNova` are strong-only unless separately approved as weak
evidence; recognizing their metadata does not make them deployment, routing,
or prefix aliases.

Hosting, routing, upload, and virtual-product aliases remain excluded when
marked ineligible, including OpenRouter, Groq, OpenCode/OpenCodeFree, and Kilo.
Fireworks, `utter-project`, Azure, generic model hosts, and other unregistered
prefixes remain ineligible as prefix evidence. Exact platform-owned products
may still classify through controlled or qualified product rules. A leading
OpenRouter Llama tail therefore resolves to Meta through the Llama family, not
through the OpenRouter namespace.

Derived-model policy remains deliberately narrow. Stable explicit
`DeepSeek-R1-Distill-Llama*` and `DeepSeek-R1-Distill-Qwen*` grammars resolve to
DeepSeek even under an otherwise unrecognized serving namespace. Qualified or
controlled rules cover reviewed products such as Deep Cogito and EuroLLM.
There is no general inference from arbitrary embedded base-model names.
Fireworks needs no provider-specific special case: its DeepSeek distill IDs
classify only through the same explicit derived grammar.

Each DeepSeek derived grammar supersedes only its documented base family:
Qwen supersedes Alibaba and Llama supersedes Meta. A model that also contains a
different vendor family remains ambiguous unless an eligible exact `deepseek/`
prefix corroborates the already-present DeepSeek candidate. This prevents a
Qwen-derived rule from erasing a Llama conflict, and vice versa. The separate
dated-Qwen grammar retains its existing namespace restrictions.

## Cross-Site Behavior Matrix

| Source | Readiness route | Adapter evidence | Fallback |
| --- | --- | --- | --- |
| New API-family default pricing | Direct pricing | Optional deployment category after adapter join | metadata arbitration, curated rules, then known deployment alias on no-match |
| Older New API forks | Direct pricing | Usually none | metadata, curated rules |
| OneHub / DoneHub | Direct pricing override | Weak routing provider | metadata arbitration, curated rules, then recognized owner on no-match |
| AIHubMix | Direct pricing | Publisher/developer when provided | metadata, curated rules |
| Sub2API | Token-scoped runtime catalog | None currently | metadata, curated rules |
| SharedChat | Token-scoped catalog | None currently | metadata, curated rules |
| API credential profile | Profile catalog | None currently | metadata, curated rules |
| Future direct-pricing site | Direct pricing | Optional row evidence | same resolver, no UI change |
| Future catalog-only site | Token/profile catalog | Optional descriptor evidence | same resolver, no UI change |

Readiness continues to select the route. It does not decide vendor policy and
does not gain a vendor-related profile flag.

## Model List Data Flow

1. readiness selects direct pricing or token-scoped catalog using existing
   capability and profile contracts.
2. the selected adapter returns canonical pricing rows or model descriptors,
   with optional row-level vendor evidence.
3. catalog-only descriptors are converted to canonical pricing rows without
   discarding evidence.
4. `useModelListData` loads models.dev metadata independently.
5. a memoized shared identity index resolves metadata for each row.
6. the site-neutral vendor resolver combines row evidence, resolved metadata,
   and curated rules into per-row vendor candidates.
7. a dataset-level aggregation groups candidates by vendor key, selects stable
   labels, and attaches the same canonical descriptor to every matching row.
8. capability filters consume the same resolved metadata record.
9. vendor tabs and counts are derived from the canonical vendor catalog and
   current post-base-filter rows rather than a global static provider list;
   unresolved rows contribute only to a separate Unclassified count.
10. `CalculatedModelItem.resolvedVendor` flows through
   `ModelDisplay -> ModelItem -> ModelItemHeader`; row components do not invoke
   the resolver again.
11. row headers and tabs use the feature-local presentation registry and
    `ModelVendorMark` for library-owned brand marks or neutral local fallbacks.

The page remains usable before metadata loads by using adapter evidence and
curated rules. If metadata later supplies stronger evidence, only rows without
stronger Publisher evidence are reclassified.

`useFilteredModels` derives available vendor keys and the unresolved-row count
after all non-vendor filters, then returns an `effectiveSelectedVendor`. A
known/custom key remains effective only while present;
`filter:unclassified` remains effective only while its count is greater than
zero; otherwise selection clamps to `filter:all`. Filtering and `ProviderTabs`
consume that effective value immediately. Model List synchronizes stale stored
selection to All in an effect. This automatic state repair does not emit the
user-action filter telemetry event.

Unresolved models remain visible under All. When their post-base-filter count
is greater than zero, Model List also shows a distinct Unclassified tab with a
help/question mark; selecting it returns only unresolved rows. All keeps its
own grid icon and continues to show both classified and unresolved rows.
Vendor tabs sort by descending count and then by vendor key, producing stable
ordering when counts tie.

## Protocol Ownership

Model vendor does not determine the API protocol used by a source. A Claude
model exposed by a New API gateway may still require the OpenAI-compatible
protocol.

This design therefore does not route single-model or batch verification
through `ModelVendorResolver`:

- saved API credential profiles keep their explicit `apiType` as the protocol
  source of truth;
- account-backed protocol defaults remain unchanged in this slice;
- correcting account verification protocol inference belongs to a future
  source-capability or verification-policy design, not vendor classification.

The legacy `identifyProvider(modelId)` contract currently returns family-style
values such as `Claude` and `Gemini` to account verification flows. This slice
retains it as a narrow compatibility wrapper, or extracts an equivalent
model-ID-to-verification-default helper with identical behavior. The new
publisher IDs do not replace that protocol-facing return type. Single-account
and batch AUTO verification tests must remain green even if Model List stops
using the old provider module.

## Failure And Ambiguity Handling

- models.dev failure keeps the page functional through adapter evidence and
  curated rules.
- malformed native vendor registries are dropped inside their adapter; raw
  IDs or registry entries never leak into the product contract.
- blank or malformed descriptors are dropped at the catalog normalization
  boundary.
- conflicting evidence for a duplicate descriptor is removed without dropping
  the model.
- arbitrary deployment-category names remain non-publisher facts and do not
  create custom publisher identities.
- ambiguous metadata aliases do not produce capability metadata or a vendor.
- exact known metadata aliases are terminal, while exact custom metadata stays
  custom unless an explicit qualified, controlled, or attribution product
  policy supplies one unambiguous known candidate.
- models.dev family values never match an otherwise unresolved model.
- curated resolution distinguishes ambiguity from no-match. Ambiguous matches
  do not use iteration order, resolve to Unknown, and cannot fall through to
  deployment or routing evidence. Only a true no-match may use those weak
  fallbacks.
- embedded base-family tokens do not establish ownership for unknown-leading
  derivatives; only reviewed derived grammars and candidate-corroborating
  prefixes may change the result.
- cross-vendor normalized aliases fail deterministically during registry
  initialization instead of taking ownership from insertion order.
- source-provider namespaces are not promoted to model ownership merely
  because they appear before `/`; only exact curated aliases still eligible
  for weak evidence may use the strict two-segment fallback.
- unsupported upstream icon references are never fetched or injected.
- provider display labels are treated as plain text.
- existing dated-model and version-equivalence protections remain unchanged
  for model redirect/sync.

## Compatibility And Migration

- `ModelPricing.vendorEvidence` is optional, so existing pricing builders
  remain valid while adapters migrate.
- `ModelCatalogCapability` implementations migrate atomically from strings to
  descriptors. Raw API service functions may continue returning strings; the
  adapter is responsible for wrapping them.
- `buildModelListCatalogPricingResponse` accepts descriptors. Compatibility
  helpers that currently receive string arrays normalize them before calling
  the builder.
- Sub2API estimate assembly preserves descriptor evidence across successful
  estimates, missing dashboard authentication, and pricing-source failure.
- existing New API-family sites that omit vendor fields continue through
  metadata and fallback rules.
- OneHub/DoneHub preserve their direct-pricing override and do not inherit the
  New API default DTO parser.
- Sub2API readiness, dashboard estimates, and runtime-key fallback remain
  behaviorally unchanged.
- internal provider values change from mixed display keys such as `Claude`
  and `Gemini` to canonical provider IDs. Model List state is local and needs
  no persisted migration.
- visible labels intentionally change to publishers such as Anthropic, Google,
  xAI, Alibaba, and Meta.
- bump the persisted pricing cache key from `modelPricing_cache_v1` to
  `modelPricing_cache_v2`. Version 1 entries are not read because they predate
  normalized evidence semantics. Version 2 round-trips optional evidence and
  otherwise preserves the existing ten-minute TTL and account-key behavior.

## Testing Strategy

Follow TDD for executable changes.

### Shared Contracts And Catalog Migration

Add tests proving:

- catalog adapters return normalized descriptors;
- invalid and duplicate descriptor IDs are removed at the neutral catalog
  boundary;
- conflicting evidence on duplicate descriptor IDs is dropped rather than
  resolved by array order;
- optional vendor evidence survives catalog-only pricing-response assembly;
- Sub2API, SharedChat, and profile catalogs retain existing model IDs and
  readiness routes after migration;
- Sub2API evidence survives successful estimates, missing dashboard auth, and
  estimate failure.

### Adapter Evidence

Add adapter-focused tests for:

- New API's valid `vendor_id/vendors` join producing DeploymentCategory
  evidence;
- missing, malformed, and unknown New API vendor references producing no
  evidence without failing pricing;
- OneHub/DoneHub continuing to use their pricing override and producing only
  weak RoutingProvider evidence;
- AIHubMix `developer_name/developer` producing Publisher evidence before the
  legacy fields collapse;
- AIHubMix `owner_by` remaining weak routing evidence and a standalone numeric
  `developer_id` producing no displayable vendor evidence;
- old New API-family payloads remaining valid.

### Shared Identity Index

Add focused service tests for:

- exact full and provider-qualified metadata IDs;
- bare-ID and name aliases;
- date and separator normalization;
- duplicate bare IDs and duplicate names;
- ambiguous token aliases;
- family values being usable only after a metadata record resolves;
- short and generic family values not becoming automatic match rules;
- arbitrary gateway-prefixed IDs not being trusted as publisher namespaces;
- strict dated/version behavior used by model redirect.

Move the existing Model List metadata-index assertions to this shared service
surface.

### Vendor Resolution

Add table-driven tests for every evidence level and conflict:

- Publisher evidence wins;
- exact known metadata wins over deployment-category and routing evidence;
- exact custom metadata remains custom except for explicit qualified,
  controlled, or attribution product policy;
- a known deployment-category alias classifies an opaque model only after a
  curated no-match;
- an arbitrary deployment category does not create a publisher tab;
- curated rules classify non-standard names;
- curated ambiguity remains Unknown even when deployment or routing evidence
  names a known vendor;
- exact weak-eligible vendor and brand aliases classify otherwise opaque
  two-segment IDs and may corroborate only an already-present candidate in an
  eligible derived-model tie;
- verified strong-only official aliases resolve Publisher and metadata facts
  without leaking into prefix, deployment, or routing fallback;
- actual unknown-leading derivative IDs with embedded Llama, Qwen, Mistral, or
  DeepSeek tokens remain Unknown, while leading canonical families and the
  reviewed DeepSeek distill grammar retain their intended ownership;
- mixed Qwen/Llama DeepSeek derivatives remain ambiguous without exact
  DeepSeek prefix corroboration and do not override exact custom metadata;
- prefix suffix conflicts, excluded hosting aliases, unregistered models.dev
  labs, nested or malformed paths, NFKC/case variants, routing decorations,
  and punctuation-near-misses retain deterministic behavior;
- recognized routing evidence is used only as a final weak fallback;
- gateway, `custom`, unknown, blank, and numeric routing values are ignored;
- ambiguous signals produce Unknown;
- boundary rules reject unrelated names containing short fragments such as
  `yi` or `o2`.

Add an all-accounts identity matrix covering:

- known and custom namespaces;
- custom names equal to `all` or `unknown`;
- identical response-local external IDs with different labels;
- labels differing by case or whitespace;
- punctuation-distinct labels that must not share a key;
- known publisher aliases that must merge into the curated key.

Include DALL-E, Llama/Meta, Gemma/Google, NVIDIA/Nemotron, MiniMax,
Xiaomi/MiMo, and current repository fixtures.

### Model List

Update hook and component tests for:

- dynamic tabs from direct-pricing and catalog-only rows;
- vendor counts after account, group, search, and capability filters;
- selecting a dynamically discovered vendor;
- the conditional Unclassified tab appearing only while the post-base-filter
  unresolved count is greater than zero;
- `filter:unclassified` selecting only unresolved rows and clamping to All
  when that count reaches zero;
- distinct All and Unclassified icons and semantics;
- consistent library-owned Color/Mono brand marks in rows and tabs;
- explicit initials for known vendors without a library asset;
- the generic CPU mark for custom vendors and help/question mark for unresolved
  rows;
- neutral, theme-aware badge surfaces without project-maintained brand colors;
- direct ESM icon imports and the absence of remote icon URL rendering;
- selected-tab fallback when a vendor disappears;
- metadata arrival respecting stronger Publisher evidence;
- effective selection, visible rows, stored-state repair, and absence of
  user-action telemetry during automatic clamping;
- stable count-descending/vendor-key tie ordering;
- the `resolvedVendor` prop chain from calculated row through the header.

Avoid exact whole-array assertions unless full ordering is the product
contract.

### Readiness And Protocol Regression

Run the readiness and runtime-key fallback suites to prove that the
`modelPricing` / `modelCatalog` route matrix is unchanged across New API,
AIHubMix, Sub2API, SharedChat, and profiles.

Add an explicit regression assertion that profile `apiType` remains the
verification protocol source. Keep account single-model and batch AUTO
verification tests for the legacy Claude/Gemini defaults. Do not add
vendor-to-protocol behavior.

### Pricing Cache

Add focused tests proving:

- version 2 cache entries round-trip row-level evidence;
- legacy version 1 entries are ignored;
- evidence-free version 2 rows remain valid;
- all-accounts cache hits retain each response's independent row evidence.

### Redirect And Sync Regression

Run and extend metadata normalization and model redirect tests only where the
shared index changes behavior. Preserve explicit-date and cross-version
rejection cases. Add direct `generateModelMappingForChannel(...)` coverage for
two IDs that differ only by explicit date and prove that no mapping is
generated between them. Add a scheduler/model-sync regression proving that the
same mismatch is not applied through the sync call path.

### E2E Decision

Do not add Playwright coverage by default. Identity resolution, descriptor
normalization, readiness preservation, dynamic tabs, and rendering are more
precisely covered with Vitest and Testing Library. Add E2E only if the
implementation exposes a browser-only integration failure.

## Telemetry Decision

Reuse the existing Model List provider-filter event. It records mode and
result count without recording provider, model, URL, owner, or evidence names.
Do not add telemetry fields.

## Expected Files

The implementation plan must verify exact placement, but the expected surface
is:

- a new shared descriptor/evidence contract under `src/services/models/`
- `src/services/modelList/pricingModel.ts`
- `src/services/modelList/pricingResponse.ts`
- `src/services/modelList/accountSources/runtimeKeyFallback.ts`
- `src/services/modelList/accountSources/sub2apiEstimates.ts`
- `src/services/apiAdapters/contracts/modelCatalog.ts`
- `src/services/apiAdapters/newApi/modelPricing.ts`
- `src/services/apiAdapters/sub2api/modelCatalog.ts`
- `src/services/apiAdapters/sharedchat/modelCatalog.ts`
- New API-family native pricing DTO/normalization modules
- AIHubMix pricing normalization
- `src/services/apiCredentialProfiles/modelCatalog.ts`
- a new shared identity-index module under
  `src/services/models/modelMetadata/`
- `src/services/models/modelMetadata/ModelMetadataService.ts`
- `src/services/models/modelMetadata/types.ts`
- `src/services/models/modelPricingCache.ts`
- `src/services/models/utils/modelProviders.ts` or its replacement resolver
- a feature-local Model List vendor presentation registry
- `src/features/ModelList/components/ModelVendorMark.tsx`
- `src/components/icons/InitialsIcon.tsx`
- `src/features/ModelList/modelCapabilityFilters.ts`
- `src/features/ModelList/hooks/useFilteredModels.ts`
- `src/features/ModelList/ModelList.tsx`
- `src/features/ModelList/components/ProviderTabs.tsx`
- `src/features/ModelList/components/ModelDisplay.tsx`
- `src/features/ModelList/components/ModelItem/index.tsx`
- `src/features/ModelList/components/ModelItem/ModelItemHeader.tsx`
- `src/locales/*/modelList.json` for the Unclassified label and explanation
- focused tests corresponding to these modules
- `package.json` and `pnpm-lock.yaml` for the `@lobehub/icons` upgrade

`batchVerification.ts` and `VerifyApiDialog` are not behavior-change targets,
but their existing protocol-default tests are required compatibility gates.

Vendor names remain proper nouns. The new Unclassified label and explanation
must be synchronized across every supported app locale.

## Validation

Use progressive gates:

1. focused Vitest for descriptor normalization, adapter evidence, the shared
   identity index, and vendor resolution;
2. focused readiness, runtime-key fallback, profile catalog, Model List hook,
   component, metadata normalization, and redirect regression suites;
3. `vitest related --run` for touched TS/TSX files;
4. `pnpm run i18n:extract:ci` only if translation calls or locale keys change;
5. `pnpm compile` and `pnpm knip` because shared capability and product
   contracts change;
6. run a production build to verify direct ESM icon imports and bundle wiring;
7. stage only task-scoped files and run `pnpm run validate:staged`;
8. run `pnpm run validate:push` before remote handoff.

## Maintainability Decision

Reuse existing model-name helpers, metadata download service, adapter
registry, readiness resolver, and catalog-pricing builder. Extract only the
shared descriptor contract, duplicated metadata indexing, and vendor product
policy. Keep the resolver domain-pure and map icons/styles in the Model List
presentation layer. Let `@lobehub/icons` own brand geometry and color; keep
only one reusable neutral badge surface plus generic, unknown, and initials
fallbacks in project code.

Do not add a shallow vendor capability, a vendor-related account-site profile
flag, or a site-type branch in Model List. Do not broaden the change into
persistent metadata caching, source-provider UI, verification protocol policy,
or sync scheduler refactoring.

## Completion Criteria

- every pricing or catalog adapter can optionally return the same row-level
  vendor-evidence contract;
- New API native vendor registries are normalized inside its adapter and never
  reach Model List;
- AIHubMix developer evidence and OneHub routing evidence retain distinct
  semantics;
- catalog-only sources work with `{ id }` descriptors and can add evidence in
  the future without changing UI contracts;
- catalog and Sub2API estimate paths retain descriptor evidence end to end;
- metadata and curated rules classify rows that have no adapter evidence;
- arbitrary deployment categories and unsafe metadata family tokens do not
  become publisher matches;
- known and custom vendor keys cannot collide with each other or with filter
  sentinels;
- dataset aggregation assigns one deterministic label and descriptor to every
  row sharing a vendor key;
- dynamic vendors appear as Model List tabs with stable labels and icons;
- unresolved rows remain an `unknown` row state while the separate
  `filter:unclassified` sentinel conditionally exposes them when their
  post-base-filter count is greater than zero;
- All and Unclassified retain distinct filter semantics and icons;
- library Color/Mono assets own known-brand marks, known vendors without an
  asset use initials, custom vendors use the generic CPU mark, and unresolved
  rows use the help/question mark;
- brand assets use direct local ESM imports; no remote icon URL is rendered;
- Llama is classified as Meta and Gemma as Google;
- vendor filtering, counts, and row icons share one resolved result;
- disappearing vendors clamp filtering and stored selection to All without
  emitting user-action telemetry;
- vendor classification does not affect verification protocol selection;
- legacy single-model and batch AUTO verification defaults remain unchanged;
- version 2 pricing cache entries preserve vendor evidence and version 1
  entries are ignored;
- metadata lookup and ambiguity handling are no longer duplicated in the
  Model List feature;
- readiness routes and model redirect date/version safety remain unchanged;
- focused, related, compile, knip, staged, and push validation gates pass.
