# 03: Board view

**What to build:** The console's **Board** page, for both workspaces (Demo is read-only, from the seeded Board; the sandbox shows the visitor's Board).

- Default: Kanban columns by Urgency (Emergency / Urgent / Routine). Cards show id, title, Trade badge and Location, plus the linked Message count. Closed Work Orders sit in a collapsed "Closed" column.
- A toggle to a table view, filterable by Urgency, Trade and Location.
- Clicking a Work Order opens a side sheet with its description and the Messages linked to it.
- **Property Roster** page in the same style (Properties with their Units, Common Areas and Tenants, read-only), replacing the `<details>` block.

**Blocked by:** 01
**Stacked on:** issue/02-sandbox-workspace

**Status:** in-progress

- [x] Kanban by Urgency with a collapsed Closed column
- [x] Table view with Urgency, Trade and Location filters
- [x] Work Order side sheet with its linked Messages
- [x] Property Roster page

## Comments

Usage: Implementer 44 input, 22,559 output, 73,663 cache creation, 1,287,708 cache read; Review Session 22 input, 5,347 output, 39,193 cache creation, 471,897 cache read.

**Review Session: Non-critical Findings**

- app/console/board-view.tsx names the Work Order component `WorkOrderCard`; GLOSSARY.md's Avoid list forbids 'card' for a Work Order outside the Trello adapter.
- Table filter <select> onChange handlers cast event.target.value with `as Urgency | undefined` / `as Trade | undefined` instead of checking it against URGENCIES / the Trade values.
- components/ui/sheet.tsx exports `SheetClose`, which nothing uses (dead export).
- The Kanban card button's aria-label (`id: title`) replaces its content, so screen readers lose the Trade, Location and linked Message count shown on it.
- BoardView's header counts open and closed Work Orders with its own filters instead of reusing boardColumns, and the workspace badge markup is copied between the Board and Property Roster headers.

**Gate passed**: every command exited 0 (log: `.sandcastle/logs/gate-03-2026-11-20T20-54-09-885Z.log`).

Usage: Body writer 2 input, 1,143 output, 29,285 cache creation, 11,842 cache read.
