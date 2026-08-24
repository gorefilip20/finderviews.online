/**
 * Finder visual reminder: Finderviews brand mark — warm editorial utility, charcoal confidence,
 * and Scout Lime as the decisive verification signal.
 */
import { cn } from "@/lib/utils";

interface FinderLogoProps {
  inverse?: boolean;
  compact?: boolean;
  className?: string;
}

export default function FinderLogo({ inverse = false, compact = false, className }: FinderLogoProps) {
  return (
    <div className={cn("finder-logo", inverse && "finder-logo--inverse", className)} aria-label="Finderviews home">
      <img
        src="/manus-storage/finder-compass-logo_17aacbc4.png"
        alt=""
        className="finder-logo__mark"
      />
      {!compact && <span className="finder-logo__word">finderviews</span>}
    </div>
  );
}
