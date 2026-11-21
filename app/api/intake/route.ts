import { configuredLiveIntakeDependencies, createLiveIntakeHandler } from "@/live";

/**
 * The sandbox workspace's live Intake: runs Intake on the sandbox state the browser sends, on the shared
 * free-tier model (rate-limited per visitor and per day) or the visitor's own key.
 * See src/live for the handler.
 */
export const POST = createLiveIntakeHandler(configuredLiveIntakeDependencies());
