## ADDED Requirements

### Requirement: LDOH site list refresh triggers temp context only on 403
When refreshing the LDOH site list, the system MUST consider using a temporary browsing context (temp-window / `tempcontext`) only when the primary LDOH request fails with **HTTP 403**.

The system MUST NOT create or reuse a temporary browsing context for **HTTP 401** (unauthenticated) or **HTTP 429** (rate limited) responses from the primary LDOH request.

#### Scenario: HTTP 401 does not trigger temp context
- **GIVEN** the system attempts to refresh the LDOH site list
- **AND** the primary request returns **HTTP 401**
- **WHEN** the refresh flow handles the failed response
- **THEN** the system MUST treat the LDOH site list as unavailable due to missing/invalid session
- **AND** the system MUST NOT create or reuse a temporary browsing context for this refresh attempt

#### Scenario: HTTP 429 does not trigger temp context
- **GIVEN** the system attempts to refresh the LDOH site list
- **AND** the primary request returns **HTTP 429**
- **WHEN** the refresh flow handles the failed response
- **THEN** the refresh MUST fail safely due to rate limiting
- **AND** the system MUST NOT create or reuse a temporary browsing context for this refresh attempt

#### Scenario: HTTP 403 triggers temp context retry when available
- **GIVEN** the system attempts to refresh the LDOH site list
- **AND** the primary request returns **HTTP 403**
- **WHEN** temp context fallback is enabled and available
- **THEN** the system MUST attempt the refresh via a temporary browsing context
- **AND** if the temp context request succeeds, the system MUST update the cached LDOH site list with the returned sites

#### Scenario: HTTP 403 fails safely when temp context is unavailable
- **GIVEN** the system attempts to refresh the LDOH site list
- **AND** the primary request returns **HTTP 403**
- **WHEN** temp context fallback is disabled, unavailable, or blocked by missing permissions
- **THEN** the refresh MUST fail safely without blocking UI surfaces that depend on the cache
