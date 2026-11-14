# The agent proposes; it never writes to the Board

The agent only has read-only tools (Property Roster lookup, Work Order search). It finishes each Message by submitting a single structured Proposal, which deterministic code validates and then either applies to the Board or routes to the Review Queue. We chose this over giving the agent `createWorkOrder`/`updateWorkOrder` tools for four reasons: a failed or misbehaving run can't leave the Board half-modified, evals compare Proposals with no side effects, runs can be replayed exactly, and human review has a single, natural checkpoint.

## Consequences

- Adding a new kind of change (e.g. closing a Work Order) means extending the Proposal schema and the applier. Do not add a write tool.
- A Proposal must be checked against the current Board when it is applied, because the Board may have changed while it sat in the Review Queue.
