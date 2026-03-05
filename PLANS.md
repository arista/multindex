# Plans

This document tracks the roadmap and planned features for brint

## Current Focus

I've started on a [design](./docs/design.md), focusing for now on the user API's.  Take a look and see what you think.  Please consult the below Docs and References for questions

responses to observations:

2.  dual syntax

Hoping to improve ergonomics to handle the typical case, with a fall-through to more complex cases.  Would you suggest differently?  For example, have them all use some kind of builder pattern?

3. compoundKey()

I think I was thinking that could just be specified as an array rather than a special builder.  what do you think?

4. BTree vs. Sorted

The idea is to allow the application to make implementation choices at this point - in this particular example, the application chooses between just a sorted array vs. a more scalable BTree


## Docs and References

When working, refer to the [overview](./docs/overview.md), and the [overview-analysis](./docs/overview-analysis.md), although both may slowly become out of date.

## TODO

