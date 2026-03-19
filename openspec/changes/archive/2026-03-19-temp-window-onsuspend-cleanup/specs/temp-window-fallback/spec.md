## ADDED Requirements

### Requirement: Temp-window fallback performs best-effort suspend cleanup
When the extension background lifecycle signals that it is about to suspend, the system MUST attempt to close any currently tracked temp-window fallback contexts and clear their in-memory tracking records.

This suspend cleanup is a best-effort fallback and supplements, rather than replaces, the normal request-completion cleanup flow.

#### Scenario: Suspend occurs while temp contexts are tracked
- **WHEN** the background suspend handler runs
- **AND** one or more temp-window fallback contexts are currently tracked in memory
- **THEN** the system MUST attempt to close each tracked temporary tab or window
- **AND** the system MUST attempt to clear the corresponding temp-context tracking records

#### Scenario: Suspend occurs with no tracked temp contexts
- **WHEN** the background suspend handler runs
- **AND** no temp-window fallback contexts are currently tracked in memory
- **THEN** the system MUST complete the suspend cleanup path without throwing an error

#### Scenario: Normal reuse behavior remains unchanged before suspend
- **WHEN** temp-window fallback requests complete while the background remains active
- **THEN** the system MUST continue using the existing request-completion release flow for temp-context reuse and delayed close behavior
- **AND** the suspend cleanup path MUST NOT be required for normal temp-context release
