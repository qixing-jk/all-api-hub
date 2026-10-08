# All API Hub Context

All API Hub supports multiple upstream API management backends through compatibility buckets and site-specific integrations.

## Language

**Site Type**:
A stable identifier for a supported or detectable API management site category.
_Avoid_: backend, provider, deployment

**Upstream Backend**:
The external API management system, fork, or deployment family behind a site.
_Avoid_: site type

**Account Site Type**:
A site type that supports saved-account onboarding and account-level operations.
_Avoid_: managed site

**Managed Site Type**:
A site type with managed-site provider and channel-management integration.
_Avoid_: account site type, compatible site

**Account-Only Site Type**:
An account site type that does not provide managed-site provider or channel-management integration.
_Avoid_: managed site

**Adapter Family**:
A registry grouping for account site types that share enough capability behavior to reuse a site-adapter implementation family.
_Avoid_: exact clone, alias

**Site Adapter Capability**:
An explicit account-site behavior seam exposed when callers need site-specific facts or protocol behavior.
_Avoid_: dedicated override, alias, fallback

**Product Canonical Model**:
A normalized product-owned shape consumed by features after upstream backend payloads have been adapted.
_Avoid_: upstream response, New API response

**Announcement Source**:
An origin of announcements with its own sharing scope and available operations.
A site-wide source is shared by accounts of that site; an account-scoped source
belongs to one saved account. Scope does not imply support for upstream read
acknowledgement.
_Avoid_: site type, announcement format

**Announcement Workspace**:
The user-facing scope of announcement records, source status, read-state filters,
and check/read commands. Search narrows the displayed list; it does not redefine
which accounts a manual check touches.
_Avoid_: announcement cache, polling task

**Announcement Identity Ledger**:
Durable first-seen, last-seen, and read facts for an announcement identity. These
facts survive eviction of the cached announcement content, so rediscovery does
not make a known announcement new again.
_Avoid_: announcement content cache

**Check-in Status Workspace**:
The accepted check-in status snapshot together with the saved-account evidence
and display facts needed to interpret it. Latest-result acceptance and pending
load completion are separate facts; execution commands do not own their rules.
_Avoid_: check-in run, scheduler

**Provider Model Catalog**:
A model catalog whose membership and facts apply to an upstream provider as a whole rather than to one saved account.
_Avoid_: account-available models, account model catalog

**Personalized Model Catalog**:
A model catalog filtered by an authenticated user's preferences, privacy settings, or access policy.
_Avoid_: workspace model catalog, provider model catalog

**Model Display Fact**:
A typed, product-selected, read-only model fact derived from a catalog item for presentation to users.
_Avoid_: raw upstream field, model response property

**Managed Upstream Resource**:
An upstream-native administrative resource managed through a Managed Site Type, such as a channel, provider, or outbound route.
_Avoid_: managed site channel

**Resource Display Facts**:
A safe product-selected projection of a managed upstream resource for read-only display.
_Avoid_: raw upstream payload, full native detail

**Editable Resource Projection**:
A product-selected subset of managed upstream resource fields that users can edit without exposing the complete upstream schema.
_Avoid_: generated upstream form, full-field editor

**Account Runtime Key**:
A product canonical model for a key that can be used for account-scoped runtime
requests such as verification, model probing, export, or CLI configuration,
regardless of whether the key comes from an API token resource or an account
service credential.
_Avoid_: API token, token row

**Account Service Credential**:
An upstream-owned singleton inference credential for a saved account. Obtaining
or rotating it is distinct from managing that account's native API token
resources; it may provide an Account Runtime Key without native token CRUD.
_Avoid_: API Credential Profile, API token resource

**API Credential Profile**:
A saved inference credential and its connection, verification and usage facts,
which can be used independently of a saved account. An association with an
Account Runtime Key does not make the profile the owner of that upstream key.
_Avoid_: saved account, upstream key resource

**Model Redirect Mapping**:
A mapping from a requested model identity to an upstream model identity for a
Managed Upstream Resource. Matching candidate identities and accepting a mapping
change are separate facts; a changed mapping does not establish that inference
verification succeeded.
_Avoid_: model catalog, verified model

**Temporary Browsing Context**:
An extension-owned browsing context used to perform an authorized task against
a site. Multiple tasks may share a context, while private and regular browsing
remain separate. Finishing one task does not imply that other tasks have finished.
_Avoid_: user tab, saved account session

**Account Post-save Workflow**:
The follow-up to an already saved account that may obtain an Account Runtime Key,
wait for required key input or one-time-secret acknowledgement, and continue to
managed-site configuration.
_Avoid_: account save, Sub2API group selection

**Account Detection Attempt**:
An admitted discovery or onboarding attempt for an Account Draft. Its results may
become obsolete when the draft changes, while its pending preparation, discovery,
and cleanup still belong to that attempt. Accepting initial onboarding
normalization does not accept later user changes.
_Avoid_: detected account, saved account, detection result

**Account Draft**:
Editable account facts and explicit user choices before persistence. Credentials
and discovered check-in facts belong to the account identity they were obtained
for; changing that identity may invalidate the evidence without changing the
user's Automatic Check-in Intent.
_Avoid_: saved account, detected account

**Managed Site Batch Import Session**:
A batch of Account Runtime Keys selected for import into one managed-site target,
together with its preview, user edits and cumulative execution results. Retrying
failed entries retains the successful results; changing the target invalidates
the previous target's preview and pending feedback.
_Avoid_: account save, single import attempt

**Channel Verification Protocol**:
The inference protocol used to verify models for a Managed Upstream Resource.
It is derived from that resource's upstream-native channel type; identical type
identifiers in different Managed Site Types do not imply the same protocol.
_Avoid_: site type, channel type

**Automatic Check-in Intent**:
A user's choice that an account may participate in automatic check-in,
independent of current method support, readiness, and the latest result.
_Avoid_: check-in support, check-in readiness

**Check-in Readiness**:
Whether an account currently has a selected usable method and the saved account
data and credentials required to execute it.
_Avoid_: enabled, supported, latest status

**Check-in Execution Outcome**:
What happened in one attempt: succeeded, failed, or was not executed.
_Avoid_: readiness, reason

**Check-in Reason**:
A stable explanation for a readiness or execution outcome, such as user intent,
method selection, credentials, network connectivity, or source availability.
_Avoid_: status

**Check-in Method**:
An account-level protocol choice shown to users. A sole official method may use a generic name; a third-party or fork-specific method includes its distinguishing source.
_Avoid_: provider, site type

**Check-in Method Source**:
The product or fork whose protocol distinguishes one check-in method from another. It is omitted when the account has only one official method.
_Avoid_: provider

## Relationships

- An **Account Site Type** is a **Site Type** that supports saved-account workflows.
- A **Managed Site Type** is a **Site Type** that supports managed-site channel workflows.
- A **Site Type** may be both an **Account Site Type** and a **Managed Site Type**, but neither category implies the other.
- An **Account-Only Site Type** is an **Account Site Type** that is not a **Managed Site Type**.
- A **Site Adapter Capability** may use shared **Adapter Family** behavior or site-specific protocol handling behind an explicit account-site seam.
- An **Upstream Backend** may have deployments or forks whose behavior differs from the default upstream reference.
- A **Product Canonical Model** may retain historical New API field names when
  those fields are now the product contract. Its owner is determined by product
  semantics, not by the upstream backend that originally shaped it.
- A **Provider Model Catalog** may be shown from an account-oriented entrypoint,
  but that does not make its contents specific to the selected account.
- A **Personalized Model Catalog** may fall back to a **Provider Model Catalog**,
  but the product must disclose the change in scope.
- A **Model Display Fact** is selected and normalized by the product; upstream
  payload shape does not determine presentation order, labels, or disclosure.
- A **Managed Upstream Resource** retains its upstream-native semantics while
  exposing only **Resource Display Facts** and an explicit **Editable Resource
  Projection** to product features.
- An **Editable Resource Projection** may expand as user needs are verified, but
  it does not imply that every field of a **Managed Upstream Resource** is
  editable.
- An **Account Runtime Key** is not necessarily an API token resource. API token
  CRUD, token metadata, and service-credential rotation remain source-specific
  behavior behind the account runtime key source.
- An **Account Post-save Workflow** follows account persistence; waiting for key
  input or acknowledgement does not mean the account has not been saved.
- A **Managed Upstream Resource** may have a **Channel Verification Protocol**,
  but model discovery support alone does not imply model verification support.
- **Automatic Check-in Intent**, **Check-in Readiness**, **Check-in Execution
  Outcome**, and **Check-in Reason** are independent facts. A failed attempt does
  not disable the user's intent, and a disabled intent is not an execution
  failure.

## Example dialogue

> **Dev:** "Can we treat AIHubMix as a managed site because it supports accounts?"
> **Domain expert:** "No. It is an **Account-Only Site Type** unless managed-site provider support is explicitly verified."
>
> **Dev:** "Does native editing mean rendering every upstream field?"
> **Domain expert:** "No. The Adapter preserves the **Managed Upstream Resource**, while the product exposes only its **Editable Resource Projection**."

## Flagged ambiguities

- "site" can mean a **Site Type**, an **Upstream Backend**, or a user
  deployment; resolve the meaning before changing routing or adapter behavior.
- "compatible" does not mean "identical"; adapter-family gaps should be modeled
  through explicit **Site Adapter Capabilities**, not unnamed overrides or
  fallback branches.
- account support and managed-site support are separate categories; do not infer one from the other.
- Upstream lineage and product adoption history are different facts: repo
  domain guidance treats One API as the older upstream root family, with New
  API and OneHub as major downstream lines. Separately, the current account-site
  architecture routes most compatible account site types through the
  NewApiFamily adapter bucket, so historical New API / One API-compatible field
  names may now be product contracts rather than raw upstream DTOs.
