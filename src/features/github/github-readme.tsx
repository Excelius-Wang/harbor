import type { MouseEvent } from "react";
import type { Root } from "hast";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import parseStyle from "style-to-object";
import { visit } from "unist-util-visit";
import { normalizeSafeHttpBaseUrl } from "@/lib/url-policy";
import type { GitHubRepositoryContentContext } from "./github-data";

type GitHubReadmeProps = {
  content: string;
  inline?: boolean;
  path: string;
  reference: string;
  repository: GitHubRepositoryContentContext;
  relativeBaseUrl?: string;
  relativeImageBaseUrl?: string;
  relativeLinkFallbackUrl?: string;
  disableRelativeImages?: boolean;
  onOpenRelativeLink?: (destination: string) => boolean;
  onOpenExternal: (url: string) => void;
};

const MAX_IMAGE_DIMENSION = 4096;
const PIXEL_DIMENSION = /^([1-9]\d*)px$/i;

function normalizeImageDimension(value: unknown) {
  const dimension =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value)
        ? Number(value)
        : Number.NaN;
  return Number.isInteger(dimension) && dimension > 0 && dimension <= MAX_IMAGE_DIMENSION
    ? dimension
    : undefined;
}

function parsePixelDimension(value: string | undefined) {
  const match = value?.trim().match(PIXEL_DIMENSION);
  return match ? normalizeImageDimension(match[1]) : undefined;
}

function rehypePreserveSafeImageDimensions() {
  return (tree: Root) => {
    visit(tree, "element", (node) => {
      if (node.tagName !== "img" || typeof node.properties.style !== "string") return;

      try {
        const style = parseStyle(node.properties.style);
        const width = parsePixelDimension(style?.width);
        const height = parsePixelDimension(style?.height);
        if (width) node.properties.width = width;
        if (height) node.properties.height = height;
      } catch {
        // Invalid inline CSS is discarded with the rest of the untrusted style.
      }

      delete node.properties.style;
    });
  };
}

function isAbsoluteUrl(destination: string) {
  return /^[a-z][a-z\d+.-]*:/i.test(destination);
}

function resolveRelativePath(destination: string, readmePath: string) {
  const suffixIndex = destination.search(/[?#]/);
  const sourcePath = suffixIndex === -1 ? destination : destination.slice(0, suffixIndex);
  const suffix = suffixIndex === -1 ? "" : destination.slice(suffixIndex);
  const basePath = readmePath.includes("/") ? readmePath.slice(0, readmePath.lastIndexOf("/")) : "";
  const path = [basePath, sourcePath]
    .filter(Boolean)
    .join("/")
    .split("/")
    .reduce<string[]>((segments, segment) => {
      if (segment === "..") segments.pop();
      else if (segment !== "." && segment !== "") segments.push(segment);
      return segments;
    }, [])
    .map(encodeURIComponent)
    .join("/");
  return `${path}${suffix}`;
}

export function resolveReadmeDestination({
  destination,
  kind,
  path,
  reference,
  repository,
  relativeBaseUrl,
  relativeImageBaseUrl,
}: {
  destination: string;
  kind: "link" | "image";
  path: string;
  reference: string;
  repository: GitHubRepositoryContentContext;
  relativeBaseUrl?: string;
  relativeImageBaseUrl?: string;
}) {
  if (!destination || destination.startsWith("#") || isAbsoluteUrl(destination)) {
    return destination;
  }
  if (destination.startsWith("//")) return `https:${destination}`;
  if (destination.startsWith("/")) return `https://github.com${destination}`;

  const resolvedPath = resolveRelativePath(destination, path);
  const configuredBaseUrl = normalizeSafeHttpBaseUrl(
    kind === "image" ? (relativeImageBaseUrl ?? relativeBaseUrl) : relativeBaseUrl
  );
  if (configuredBaseUrl) return `${configuredBaseUrl}/${resolvedPath}`;
  const route = kind === "image" ? "raw" : "blob";
  return `${repository.url}/${route}/${encodeURIComponent(reference)}/${resolvedPath}`;
}

export function GitHubReadme({
  content,
  inline = false,
  path,
  reference,
  repository,
  relativeBaseUrl,
  relativeImageBaseUrl,
  relativeLinkFallbackUrl,
  disableRelativeImages = false,
  onOpenRelativeLink,
  onOpenExternal,
}: GitHubReadmeProps) {
  const openExternal = (event: MouseEvent<HTMLAnchorElement>, destination: string) => {
    event.preventDefault();
    onOpenExternal(destination);
  };

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[
        rehypeRaw,
        rehypePreserveSafeImageDimensions,
        [rehypeSanitize, defaultSchema],
      ]}
      components={{
        ...(inline
          ? {
              p: ({ children }) => <span>{children}</span>,
            }
          : {}),
        a: ({ href, title, children }) => {
          if (!href) return <span>{children}</span>;
          const relative =
            !href.startsWith("#") &&
            !href.startsWith("/") &&
            !href.startsWith("//") &&
            !isAbsoluteUrl(href);
          const destination =
            relativeLinkFallbackUrl && relative
              ? relativeLinkFallbackUrl
              : resolveReadmeDestination({
                  destination: href,
                  kind: "link",
                  path,
                  reference,
                  repository,
                  relativeBaseUrl,
                  relativeImageBaseUrl,
                });
          if (destination.startsWith("#")) {
            return (
              <a href={destination} title={title}>
                {children}
              </a>
            );
          }
          return (
            <a
              href={destination}
              title={title}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => {
                if (relative && onOpenRelativeLink?.(href)) {
                  event.preventDefault();
                  return;
                }
                openExternal(event, destination);
              }}
            >
              {children}
            </a>
          );
        },
        img: ({ alt = "", src, title, width, height }) => {
          if (typeof src !== "string" || !src) return alt ? <span>{alt}</span> : null;
          if (
            disableRelativeImages &&
            !src.startsWith("/") &&
            !src.startsWith("//") &&
            !isAbsoluteUrl(src)
          ) {
            return alt ? <span>{alt}</span> : null;
          }
          const imageWidth = normalizeImageDimension(width);
          const imageHeight = normalizeImageDimension(height);
          const destination = resolveReadmeDestination({
            destination: src,
            kind: "image",
            path,
            reference,
            repository,
            relativeBaseUrl,
            relativeImageBaseUrl,
          });
          return (
            <img
              alt={alt}
              src={destination}
              title={title}
              width={imageWidth}
              height={imageHeight}
              style={imageHeight ? { height: imageHeight } : undefined}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
            />
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export default GitHubReadme;
