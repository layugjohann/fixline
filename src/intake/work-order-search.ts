import type { WorkOrder } from "@/domain";

export interface WorkOrderSearch {
  unitId?: string;
  commonAreaId?: string;
  query?: string;
}

const MIN_WORD_LENGTH = 3;

/**
 * Open Work Orders matching the filter. A query matches when any of its words
 * appears in the title or description, so a loose query still finds candidates
 * and the agent judges whether they are really the same problem.
 */
export function searchOpenWorkOrders(workOrders: readonly WorkOrder[], filter: WorkOrderSearch): WorkOrder[] {
  const words = (filter.query ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= MIN_WORD_LENGTH);
  return workOrders.filter((workOrder) => {
    if (workOrder.status !== "open") return false;
    const { location } = workOrder;
    if (filter.unitId && (location.type !== "unit" || location.unitId !== filter.unitId)) return false;
    if (filter.commonAreaId && (location.type !== "common-area" || location.commonAreaId !== filter.commonAreaId)) {
      return false;
    }
    if (words.length === 0) return true;
    const text = `${workOrder.title} ${workOrder.description}`.toLowerCase();
    return words.some((word) => text.includes(word));
  });
}
