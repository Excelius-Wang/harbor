import { CheckCircle2, CircleMinus, Clock3, LoaderCircle, XCircle } from "lucide-react";

import { executionBucket } from "./github-execution-state";

export function GitHubExecutionStatusIcon({
  status,
  conclusion,
}: {
  status: string;
  conclusion?: string | null;
}) {
  const bucket = executionBucket(status, conclusion);
  if (bucket === "pass") {
    return <CheckCircle2 className="text-success size-4" aria-hidden="true" />;
  }
  if (bucket === "fail") {
    return <XCircle className="text-destructive size-4" aria-hidden="true" />;
  }
  if (bucket === "skipped") {
    return <CircleMinus className="text-muted-foreground size-4" aria-hidden="true" />;
  }
  if (status === "in_progress") {
    return <LoaderCircle className="text-primary size-4 animate-spin" aria-hidden="true" />;
  }
  return <Clock3 className="text-muted-foreground size-4" aria-hidden="true" />;
}
