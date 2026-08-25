import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSyntaxHighlightingWorkerClient,
  type SyntaxHighlightingWorker,
} from "./github-syntax-highlighting-worker-client";
import type {
  SyntaxHighlightWorkerRequest,
  SyntaxHighlightWorkerResponse,
} from "./github-syntax-highlighting";

class FakeSyntaxHighlightingWorker implements SyntaxHighlightingWorker {
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessage: ((event: MessageEvent<SyntaxHighlightWorkerResponse>) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  requests: SyntaxHighlightWorkerRequest[] = [];
  terminated = false;

  postMessage(message: SyntaxHighlightWorkerRequest) {
    this.requests.push(message);
  }

  respond(message: SyntaxHighlightWorkerResponse) {
    this.onmessage?.({ data: message } as MessageEvent<SyntaxHighlightWorkerResponse>);
  }

  terminate() {
    this.terminated = true;
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("syntax highlighting worker client", () => {
  it("passes the selected theme to the worker and returns its tokens", async () => {
    const worker = new FakeSyntaxHighlightingWorker();
    const client = createSyntaxHighlightingWorkerClient({
      createWorker: () => worker,
      timeoutMs: 100,
    });

    const result = client.highlight({
      source: "const harbor = true;",
      language: "typescript",
      colorMode: "light",
    });
    expect(worker.requests[0]).toMatchObject({
      source: "const harbor = true;",
      language: "typescript",
      colorMode: "light",
    });

    worker.respond({
      requestId: worker.requests[0].requestId,
      lines: [[{ color: "#0550AE", content: "const" }]],
    });
    await expect(result).resolves.toEqual([[{ color: "#0550AE", content: "const" }]]);
  });

  it("terminates stalled work and falls back after the total timeout", async () => {
    vi.useFakeTimers();
    const worker = new FakeSyntaxHighlightingWorker();
    const client = createSyntaxHighlightingWorkerClient({
      createWorker: () => worker,
      timeoutMs: 100,
    });

    const result = client.highlight({
      source: "fn main() {}",
      language: "rust",
      colorMode: "dark",
    });
    await vi.advanceTimersByTimeAsync(100);

    await expect(result).resolves.toBeNull();
    expect(worker.terminated).toBe(true);
  });
});
