# Plans

This document tracks the roadmap and planned features for brint

## Current Focus

A first draft of [design](./docs/design.md) is complete, defining the API and implementation strategies.  Please take a look and see what you think, and please place your analysis in [design-analysis](./docs/design-analysis.md).

## Docs and References

When working, refer to the [overview](./docs/overview.md), and the [overview-analysis](./docs/overview-analysis.md), although both may slowly become out of date.

## TODO

- Convenience methods: `isEmpty`, `first()`/`last()` on SortedIndex, bulk operations (`addAll`, `removeAll`), `toArray()`
- Index serialization/deserialization for persistence and transfer
- Index events/observers (`onAdd`, `onRemove`, `onReindex`) for debugging and external integrations
- Frozen/read-only mode (may need chchchchanges support)
- Add concrete usage examples showing index construction and querying

