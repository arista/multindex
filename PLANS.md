# Plans

This document tracks the roadmap and planned features for brint

## Current Focus

Prepare an implementation plan to implement the design document.  Divide the implementation into logical parts that would also be easy to review.

The first step should be setting up the generic scaffolding for a TypeScript project.  Look at chchchanges and brint for examples of how you've set up these projects in the past.  Don't start getting into the specifics of the project until the second step.

## Docs and References

When working, refer to the [design document](./docs/design.md), with accompanying [design analysis](./docs/design-analysis.md).  You can also be informed by the [overview](./docs/overview.md), and the [overview-analysis](./docs/overview-analysis.md), although both may slowly become out of date.

## TODO

- Convenience methods: `isEmpty`, `first()`/`last()` on SortedIndex, bulk operations (`addAll`, `removeAll`), `toArray()`
- Index serialization/deserialization for persistence and transfer
- Index events/observers (`onAdd`, `onRemove`, `onReindex`) for debugging and external integrations
- Frozen/read-only mode (may need chchchchanges support)
- Add concrete usage examples showing index construction and querying

