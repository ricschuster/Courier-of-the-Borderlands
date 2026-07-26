# Architecture Decision Records

This folder holds short Architecture Decision Records (ADRs) for significant technical or design choices.

## When to add an ADR

Add an ADR when:

- A new dependency is introduced.
- A stack or framework choice is made or changed.
- A significant design pattern is adopted.
- A scope decision materially affects future work.

## Format

Use one Markdown file per decision, named with a zero-padded sequence number:

`NNNN-short-title.md`

For example `0005-travel-sink-wagon-condition.md`. Take the next free number; the
sequence is the reading order, and an ADR that supersedes another says so in its
Status line rather than renumbering.

Structure:

```markdown
# Title

## Status

Proposed | Accepted | Superseded

## Context

Why this decision is needed.

## Decision

What was decided.

## Consequences

Positive and negative implications.
```

Keep each ADR short and specific.
