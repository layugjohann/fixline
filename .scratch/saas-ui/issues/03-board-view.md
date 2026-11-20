# 03: Board view

**What to build:** The console's **Board** page, for both workspaces (Demo is read-only, from the seeded Board; the sandbox shows the visitor's Board).

- Default: Kanban columns by Urgency (Emergency / Urgent / Routine). Cards show id, title, Trade badge and Location, plus the linked Message count. Closed Work Orders sit in a collapsed "Closed" column.
- A toggle to a table view, filterable by Urgency, Trade and Location.
- Clicking a Work Order opens a side sheet with its description and the Messages linked to it.
- **Property Roster** page in the same style (Properties with their Units, Common Areas and Tenants, read-only), replacing the `<details>` block.

**Blocked by:** 01

**Status:** ready-for-agent

- [x] Kanban by Urgency with a collapsed Closed column
- [x] Table view with Urgency, Trade and Location filters
- [x] Work Order side sheet with its linked Messages
- [x] Property Roster page
