import type { GitHubNotification } from "./github-data";

export function notificationCanOpenInApp(notification: GitHubNotification) {
  switch (notification.subject.kind) {
    case "release":
      return notification.subject.releaseId !== undefined;
    case "commit":
      return notification.subject.commitSha !== undefined;
    case "checkSuite":
      return notification.subject.checkSuiteId !== undefined;
    case "workflowRun":
      return notification.subject.workflowRunId !== undefined;
    case "dependabotAlert":
    case "codeScanningAlert":
    case "secretScanningAlert":
      return notification.subject.number !== undefined;
    case "issue":
    case "pullRequest":
    case "discussion":
      return notification.subject.number !== undefined;
    default:
      return false;
  }
}
