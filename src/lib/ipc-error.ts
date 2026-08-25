export type IpcError = {
  code: string;
  message: string;
};

export function parseIpcError(reason: unknown): IpcError {
  if (reason && typeof reason === "object") {
    const value = reason as { code?: unknown; message?: unknown };
    if (typeof value.code === "string" && typeof value.message === "string") {
      return { code: value.code, message: value.message };
    }
  }

  if (typeof reason === "string") {
    try {
      return parseIpcError(JSON.parse(reason));
    } catch {
      return { code: "unknown", message: reason };
    }
  }

  return { code: "unknown", message: String(reason) };
}
