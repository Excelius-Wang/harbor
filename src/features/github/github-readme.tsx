import type { MouseEvent } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import type { GitHubRepository } from "./github-data";

type GitHubReadmeProps = {
  content: string;
  path: string;
  reference: string;
  repository: GitHubRepository;
  onOpenExternal: (url: string) => void;
};

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
}: {
  destination: string;
  kind: "link" | "image";
  path: string;
  reference: string;
  repository: GitHubRepository;
}) {
  if (!destination || destination.startsWith("#") || isAbsoluteUrl(destination)) {
    return destination;
  }
  if (destination.startsWith("//")) return `https:${destination}`;
  if (destination.startsWith("/")) return `https://github.com${destination}`;

  const resolvedPath = resolveRelativePath(destination, path);
  const route = kind === "image" ? "raw" : "blob";
  return `${repository.url}/${route}/${encodeURIComponent(reference)}/${resolvedPath}`;
}

export function GitHubReadme({
  content,
  path,
  reference,
  repository,
  onOpenExternal,
}: GitHubReadmeProps) {
  const openExternal = (event: MouseEvent<HTMLAnchorElement>, destination: string) => {
    event.preventDefault();
    onOpenExternal(destination);
  };

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw, [rehypeSanitize, defaultSchema]]}
      components={{
        a: ({ href, title, children }) => {
          if (!href) return <span>{children}</span>;
          const destination = resolveReadmeDestination({
            destination: href,
            kind: "link",
            path,
            reference,
            repository,
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
              onClick={(event) => openExternal(event, destination)}
            >
              {children}
            </a>
          );
        },
        img: ({ alt = "", src, title, width, height }) => {
          if (typeof src !== "string" || !src) return alt ? <span>{alt}</span> : null;
          const destination = resolveReadmeDestination({
            destination: src,
            kind: "image",
            path,
            reference,
            repository,
          });
          return (
            <img
              alt={alt}
              src={destination}
              title={title}
              width={width}
              height={height}
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
