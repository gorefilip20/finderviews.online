import { cn } from "@/lib/utils";

interface FinderLogoProps {
  inverse?: boolean;
  compact?: boolean;
  className?: string;
}

export default function FinderLogo({ inverse = false, compact = false, className }: FinderLogoProps) {
  return (
    <div className={cn("finder-logo", inverse && "finder-logo--inverse", className)} aria-label="Finderviews home">
      <svg className="finder-logo__mark" width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" />
        <line x1="19.5" y1="19.5" x2="26" y2="26" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="12" cy="12" r="4" fill="#C8FF3D" opacity="0.85" />
      </svg>
      {!compact && <span className="finder-logo__word">finderviews</span>}
    </div>
  );
}
