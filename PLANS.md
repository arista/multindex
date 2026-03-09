# Plans

This document tracks the roadmap and planned features for brint

## Current Focus

The previous commit on main added a notion of superindexes.  I'm rethinking how that's done, probably to the point of undoing that commit.

Look at what I've added to the [design document](./docs/design.md), and let me know what you think.  Don't change anything yet.

If we do implement, I'd want it on branch nsa-type-hierarchy.  If we begin by undoing the commit on main, please put the undoing on its own commit, then the new approach on a separate commit.  That would make it easier for me to review.

## Docs and References

When working, refer to the [design document](./docs/design.md), with accompanying [design analysis](./docs/design-analysis.md). You can also be informed by the [overview](./docs/overview.md), and the [overview-analysis](./docs/overview-analysis.md), although both may slowly become out of date.

## TODO

- Convenience methods: `isEmpty`, `first()`/`last()` on SortedIndex, bulk operations (`addAll`, `removeAll`), `toArray()`
- Index serialization/deserialization for persistence and transfer
- Index events/observers (`onAdd`, `onRemove`, `onReindex`) for debugging and external integrations
- Frozen/read-only mode (may need chchchchanges support)
- Add concrete usage examples showing index construction and querying
