const HTTP_PROTOCOLS = new Set(["http:", "https:"]);
const EXTERNAL_PROTOCOLS = new Set([...HTTP_PROTOCOLS, "mailto:", "tel:"]);

function parseSafeAbsoluteUrl(value: string, protocols: ReadonlySet<string>) {
  try {
    const url = new URL(value);
    if (!protocols.has(url.protocol) || url.username || url.password) return undefined;
    return url;
  } catch {
    return undefined;
  }
}

export function normalizeSafeHttpBaseUrl(value: string | undefined) {
  if (!value) return undefined;
  const url = parseSafeAbsoluteUrl(value, HTTP_PROTOCOLS);
  if (!url) return undefined;
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/+$/, "");
}

export function isSafeExternalUrl(value: string) {
  return Boolean(parseSafeAbsoluteUrl(value, EXTERNAL_PROTOCOLS));
}
