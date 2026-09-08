import { cn } from "@/lib/utils";

/** The surrounding label or control supplies the accessible name. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 256 228"
      fill="currentColor"
      className={cn("shrink-0", className)}
    >
      <path d="M24 8 H99 C112 8 120 12 130 22 L183 75 Q188 80 196 80 H238 Q248 80 248 90 V128 Q248 140 236 140 H207 C190 140 178 132 168 122 L122 76 Q114 68 103 68 H24 Q8 68 8 52 V24 Q8 8 24 8 Z" />
      <path d="M24 100 H87 C100 100 108 104 117 113 L181 177 Q184 180 184 185 V210 Q184 220 174 220 H155 Q148 220 143 215 L96 168 Q88 160 77 160 H24 Q8 160 8 144 V116 Q8 100 24 100 Z" />
    </svg>
  );
}
