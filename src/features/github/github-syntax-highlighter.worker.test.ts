import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  SyntaxHighlightWorkerRequest,
  SyntaxHighlightWorkerResponse,
} from "./github-syntax-highlighting";

type WorkerScope = {
  onmessage: ((event: MessageEvent<SyntaxHighlightWorkerRequest>) => void) | null;
  postMessage: ReturnType<typeof vi.fn<(message: SyntaxHighlightWorkerResponse) => void>>;
};

let workerScope: WorkerScope;

beforeEach(() => {
  vi.resetModules();
  workerScope = { onmessage: null, postMessage: vi.fn() };
  vi.stubGlobal("self", workerScope);
});

afterEach(() => vi.unstubAllGlobals());

describe("syntax highlighting worker boundary", () => {
  it("falls back to plain text for an unsupported runtime language", async () => {
    await import("./github-syntax-highlighter.worker");

    await workerScope.onmessage?.({
      data: {
        requestId: 7,
        source: "fixture",
        language: "toString" as never,
        colorMode: "dark",
      },
    } as unknown as MessageEvent<SyntaxHighlightWorkerRequest>);

    expect(workerScope.postMessage).toHaveBeenCalledWith({ requestId: 7, lines: null });
  });
});
