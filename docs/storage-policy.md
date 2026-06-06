# Zenith Storage Policy

Zenith stores local project guidance context in SQLite and treats the database as the final integrity boundary.

## Relational Data

Use first-class tables and foreign keys when data must be filtered, joined, linked across entities, or protected by referential integrity. This includes projects, plans, phases, roadmaps, roadmap items, briefs, spikes, findings, sessions, and source links such as `sourceRoadmapId` and `sourceRoadmapItemId`.

## Embedded JSON

Small contextual arrays may remain JSON blobs when they are append-only or displayed as part of their parent record, and Zenith does not need to query individual elements directly. Current accepted examples are evidence lists, acceptance criteria, changed files, next steps, alternatives, and spike options.

## Normalization Trigger

Move an embedded array into a table when any of these become true:

- The CLI needs to filter, sort, or count individual elements across parents.
- The element needs a foreign key to another entity.
- The element needs independent lifecycle state.
- The element becomes large enough that compact context or TUI views need pagination by element.

Until then, JSON arrays are validated at the domain boundary and kept small enough for local-first agent guidance.
