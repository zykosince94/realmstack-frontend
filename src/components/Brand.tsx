/**
 * The RealmStack mark: a castle tower whose body is three stacked server units, each with a
 * vent slot and a status LED, under battlements. "Realm" and "Stack" read literally, and
 * the silhouette stays recognisable from favicon size up to the faint corner watermark.
 *
 * The glyph is drawn in currentColor (vent slots are holes, via evenodd), so one drawing
 * serves every use; the LEDs take --brand-led, so the tile can light them. The same paths
 * are in public/favicon.svg; change both together.
 */
export function BrandGlyph({ size = 20, className }: { size?: number; className?: string }) {
  const unit = (y: number) => `M18 ${y}h28a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H18a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2zM21 ${y + 3.5}h14v3H21z`;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <g fill="currentColor">
        {/* battlements and parapet */}
        <path d="M14 7h6v6h-6zM24 7h6v6h-6zM34 7h6v6h-6zM44 7h6v6h-6z" />
        <rect x="12" y="13" width="40" height="7" rx="1.5" />
        {/* three server units with vent slots cut out */}
        <path fillRule="evenodd" d={unit(23) + unit(35) + unit(47)} />
        {/* foundation */}
        <rect x="12" y="59" width="40" height="3" rx="1.5" />
      </g>
      <g fill="var(--brand-led, currentColor)">
        <circle cx="41.5" cy="28" r="2" />
        <circle cx="41.5" cy="40" r="2" />
        <circle cx="41.5" cy="52" r="2" />
      </g>
    </svg>
  );
}

/** The mark on its gradient tile: sidebar brand, login and boot screen. */
export function BrandLogo({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`brand-mark ${className}`} style={{ width: size, height: size, borderRadius: Math.round(size * 0.27) }}>
      <BrandGlyph size={Math.round(size * 0.72)} />
    </span>
  );
}

/** The faint mark in the bottom-right corner of every page. Decorative and click-through. */
export function BrandWatermark() {
  return <div className="brand-watermark" aria-hidden="true"><BrandGlyph size={240} /></div>;
}
