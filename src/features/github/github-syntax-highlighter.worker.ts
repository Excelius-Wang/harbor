import { highlightWithShiki } from "./github-shiki-runtime";
import type {
  SyntaxHighlightWorkerRequest,
  SyntaxHighlightWorkerResponse,
} from "./github-syntax-highlighting";

type SyntaxHighlightWorkerScope = {
  onmessage: ((event: MessageEvent<SyntaxHighlightWorkerRequest>) => void) | null;
  postMessage: (message: SyntaxHighlightWorkerResponse) => void;
};

const workerScope = self as unknown as SyntaxHighlightWorkerScope;

workerScope.onmessage = async ({ data }) => {
  try {
    const lines = await highlightWithShiki(data);
    workerScope.postMessage({ requestId: data.requestId, lines });
  } catch {
    workerScope.postMessage({ requestId: data.requestId, lines: null });
  }
};
