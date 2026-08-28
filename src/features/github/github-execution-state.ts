export type GitHubExecutionBucket = "pass" | "fail" | "pending" | "skipped";

export function executionBucket(
  status: string,
  conclusion: string | null | undefined
): GitHubExecutionBucket {
  if (status !== "completed" || !conclusion) return "pending";
  if (["success", "neutral"].includes(conclusion)) return "pass";
  if (["skipped", "cancelled"].includes(conclusion)) return "skipped";
  return "fail";
}
