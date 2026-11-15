import type { NewWorkOrder, WorkOrder, WorkOrderUpdate } from "@/domain";

/** Read-only view of the Board. This is all the agent may ever see. */
export interface BoardReader {
  listWorkOrders(): Promise<WorkOrder[]>;
  getWorkOrder(id: string): Promise<WorkOrder | undefined>;
}

/** The system of record where Work Orders live. */
export interface Board extends BoardReader {
  createWorkOrder(workOrder: NewWorkOrder): Promise<WorkOrder>;
  /**
   * Append new information to an existing Work Order and link the Message it
   * came from. Rejects if the Work Order doesn't exist.
   */
  appendToWorkOrder(id: string, update: WorkOrderUpdate): Promise<WorkOrder>;
}

/** No Work Order with this id is on the Board. */
export class WorkOrderNotFoundError extends Error {
  constructor(readonly workOrderId: string) {
    super(`Work Order ${workOrderId} is not on the Board.`);
    this.name = "WorkOrderNotFoundError";
  }
}

/**
 * Wrap a Board so only its read methods are reachable. The agent gets this,
 * so it cannot write to the Board even by reaching past its type (ADR 0001).
 */
export function readOnlyBoard(board: BoardReader): BoardReader {
  return Object.freeze({
    listWorkOrders: () => board.listWorkOrders(),
    getWorkOrder: (id: string) => board.getWorkOrder(id),
  });
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

  async appendToWorkOrder(id: string, update: WorkOrderUpdate): Promise<WorkOrder> {
    const workOrder = this.workOrders.find((candidate) => candidate.id === id);
    if (!workOrder) throw new WorkOrderNotFoundError(id);
    const information = update.information.trim();
    if (information) {
      const entry = `Update from Message ${update.messageId}: ${information}`;
      workOrder.description = workOrder.description ? `${workOrder.description}\n\n${entry}` : entry;
    }
    if (!workOrder.messageIds.includes(update.messageId)) workOrder.messageIds.push(update.messageId);
    return structuredClone(workOrder);
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
