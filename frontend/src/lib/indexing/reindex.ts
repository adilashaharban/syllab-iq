import { reviewDocument } from "../../actions/admin";

export async function triggerReprocessJob(versionId: number): Promise<void> {
  // Triggers re-indexing asynchronously to not block the admin request.
  // In a real production system, this queues a job to a Redis/RabbitMQ queue worker.
  setTimeout(() => {
    reviewDocument(versionId, "APPROVE").catch(console.error);
  }, 100);
}
