import type { NewReviewQueueEntry, ReviewQueueEntry, ReviewQueueEntryStatus } from "@/domain";

/** Where Proposals wait for a Coordinator to approve or reject them. */
export interface ReviewQueue {
  enqueue(entry: NewReviewQueueEntry): Promise<ReviewQueueEntry>;
  list(): Promise<ReviewQueueEntry[]>;
  get(id: string): Promise<ReviewQueueEntry | undefined>;
  /** Record a Coordinator's decision. Rejects if the entry doesn't exist. */
  setStatus(id: string, status: ReviewQueueEntryStatus): Promise<ReviewQueueEntry>;
}

/** No entry with this id is in the Review Queue. */
export class ReviewQueueEntryNotFoundError extends Error {
  constructor(readonly entryId: string) {
    super(`Review Queue entry ${entryId} doesn't exist.`);
    this.name = "ReviewQueueEntryNotFoundError";
  }
}

/**
 * In-memory Review Queue used by tests, evals and every demo sandbox.
 * Seeded from a snapshot so a stateless server can rebuild it per request.
 */
export class InMemoryReviewQueue implements ReviewQueue {
  private readonly entries: ReviewQueueEntry[];

  constructor(snapshot: readonly ReviewQueueEntry[] = []) {
    this.entries = snapshot.map((entry) => structuredClone(entry));
  }

  async enqueue(entry: NewReviewQueueEntry): Promise<ReviewQueueEntry> {
    const added: ReviewQueueEntry = { ...structuredClone(entry), id: this.nextId() };
    this.entries.push(added);
    return structuredClone(added);
  }

  async list(): Promise<ReviewQueueEntry[]> {
    return this.snapshot();
  }

  async get(id: string): Promise<ReviewQueueEntry | undefined> {
    const found = this.entries.find((entry) => entry.id === id);
    return found ? structuredClone(found) : undefined;
  }

  async setStatus(id: string, status: ReviewQueueEntryStatus): Promise<ReviewQueueEntry> {
    const entry = this.entries.find((candidate) => candidate.id === id);
    if (!entry) throw new ReviewQueueEntryNotFoundError(id);
    entry.status = status;
    return structuredClone(entry);
  }

  /** The current Review Queue, safe to serialise and hand back to the browser. */
  snapshot(): ReviewQueueEntry[] {
    return this.entries.map((entry) => structuredClone(entry));
  }

  private nextId(): string {
    const highest = this.entries.reduce((max, entry) => {
      const match = /^RQ-(\d+)$/.exec(entry.id);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    return `RQ-${highest + 1}`;
  }
}
