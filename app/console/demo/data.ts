import { cache } from "react";
import { demoReviewQueue } from "@/console";
import { loadReplays } from "@/replays/files";

/**
 * The Demo workspace's entries, one per recorded replay. Read from replays/ when the
 * pages are built, so the Demo makes no model calls and needs no key.
 */
export const loadDemoEntries = cache(async () => demoReviewQueue(await loadReplays()));
