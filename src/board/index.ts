import type { NewWorkOrder, WorkOrder } from "@/domain";

/** Read-only view of the Board. This is all the agent may ever see. */
export interface BoardReader {
  listWorkOrders(): Promise<WorkOrder[]>;
  getWorkOrder(id: string): Promise<WorkOrder | undefined>;
}

/** The system of record where Work Orders live. */
export interface Board extends BoardReader {
  createWorkOrder(workOrder: NewWorkOrder): Promise<WorkOrder>;
}

/**
 * In-memory Board used by tests, evals and every demo sandbox.
 * Seeded from a snapshot so a stateless server can rebuild it per request.
 */
export class FakeBoard implements Board {
  private readonly workOrders: WorkOrder[];

  constructor(snapshot: readonly WorkOrder[] = []) {
    this.workOrders = snapshot.map((workOrder) => structuredClone(workOrder));
  }

  async listWorkOrders(): Promise<WorkOrder[]> {
    return this.snapshot();
  }

  async getWorkOrder(id: string): Promise<WorkOrder | undefined> {
    const found = this.workOrders.find((workOrder) => workOrder.id === id);
    return found ? structuredClone(found) : undefined;
  }

  async createWorkOrder(workOrder: NewWorkOrder): Promise<WorkOrder> {
    const created: WorkOrder = {
      ...structuredClone(workOrder),
      id: this.nextId(),
      status: "open",
    };
    this.workOrders.push(created);
    return structuredClone(created);
  }

  /** The current Board state, safe to serialise and hand back to the browser. */
  snapshot(): WorkOrder[] {
    return this.workOrders.map((workOrder) => structuredClone(workOrder));
  }

  private nextId(): string {
    const highest = this.workOrders.reduce((max, workOrder) => {
      const match = /^WO-(\d+)$/.exec(workOrder.id);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    return `WO-${highest + 1}`;
  }
}
