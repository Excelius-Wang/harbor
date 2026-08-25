import type {
  HighlightedToken,
  SyntaxHighlightWorkerRequest,
  SyntaxHighlightWorkerResponse,
} from "./github-syntax-highlighting";

const DEFAULT_HIGHLIGHT_TIMEOUT_MS = 1_500;

export type SyntaxHighlightingWorker = {
  onerror: ((event: ErrorEvent) => void) | null;
  onmessage: ((event: MessageEvent<SyntaxHighlightWorkerResponse>) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage: (message: SyntaxHighlightWorkerRequest) => void;
  terminate: () => void;
};

type HighlightRequest = Omit<SyntaxHighlightWorkerRequest, "requestId">;
type PendingHighlight = {
  resolve: (lines: HighlightedToken[][] | null) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export function createSyntaxHighlightingWorkerClient({
  createWorker,
  timeoutMs = DEFAULT_HIGHLIGHT_TIMEOUT_MS,
}: {
  createWorker: () => SyntaxHighlightingWorker;
  timeoutMs?: number;
}) {
  let worker: SyntaxHighlightingWorker | null = null;
  let nextRequestId = 1;
  const pending = new Map<number, PendingHighlight>();

  function resetWorker(expectedWorker: SyntaxHighlightingWorker) {
    if (worker !== expectedWorker) return;
    worker.terminate();
    worker = null;
    for (const request of pending.values()) {
      clearTimeout(request.timeout);
      request.resolve(null);
    }
    pending.clear();
  }

  function getWorker() {
    if (worker) return worker;

    const nextWorker = createWorker();
    worker = nextWorker;
    nextWorker.onmessage = ({ data }) => {
      if (worker !== nextWorker) return;
      const request = pending.get(data.requestId);
      if (!request) return;
      clearTimeout(request.timeout);
      pending.delete(data.requestId);
      request.resolve(data.lines);
    };
    nextWorker.onerror = () => resetWorker(nextWorker);
    nextWorker.onmessageerror = () => resetWorker(nextWorker);
    return nextWorker;
  }

  return {
    highlight(request: HighlightRequest): Promise<HighlightedToken[][] | null> {
      const activeWorker = getWorker();
      const requestId = nextRequestId++;

      return new Promise((resolve) => {
        const timeout = setTimeout(() => resetWorker(activeWorker), timeoutMs);
        pending.set(requestId, { resolve, timeout });
        try {
          activeWorker.postMessage({ requestId, ...request });
        } catch {
          resetWorker(activeWorker);
        }
      });
    },
  };
}

let defaultClient: ReturnType<typeof createSyntaxHighlightingWorkerClient> | null = null;

export function requestSyntaxHighlighting(request: HighlightRequest) {
  defaultClient ??= createSyntaxHighlightingWorkerClient({
    createWorker: () =>
      new Worker(new URL("./github-syntax-highlighter.worker.ts", import.meta.url), {
        type: "module",
      }),
  });
  return defaultClient.highlight(request);
}
