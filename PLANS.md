# Plans

This document tracks the roadmap and planned features for brint

## Current Focus

implement step 3 from the [implementation plan](./docs/implementation-plan.md)

## Docs and References

When working, refer to the [design document](./docs/design.md), with accompanying [design analysis](./docs/design-analysis.md). You can also be informed by the [overview](./docs/overview.md), and the [overview-analysis](./docs/overview-analysis.md), although both may slowly become out of date.

## TODO

- Convenience methods: `isEmpty`, `first()`/`last()` on SortedIndex, bulk operations (`addAll`, `removeAll`), `toArray()`
- Index serialization/deserialization for persistence and transfer
- Index events/observers (`onAdd`, `onRemove`, `onReindex`) for debugging and external integrations
- Frozen/read-only mode (may need chchchchanges support)
- Add concrete usage examples showing index construction and querying
