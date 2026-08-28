export function formatBytes(bytes: number, locale: string) {
  if (bytes < 1_000) return `${bytes} B`;
  if (bytes < 1_000_000) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / 1_000)} KB`;
  }
  if (bytes < 1_000_000_000) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / 1_000_000)} MB`;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / 1_000_000_000)} GB`;
}
