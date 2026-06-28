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

## Example dialogue

> **Dev:** "Can we treat AIHubMix as a managed site because it supports accounts?"
> **Domain expert:** "No. It is an **Account-Only Site Type** unless managed-site provider support is explicitly verified."

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
