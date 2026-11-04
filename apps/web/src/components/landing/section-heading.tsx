import type { ReactNode } from "react";

/**
 * The shared section header: dash eyebrow above a display-serif heading.
 *
 * `id` is the heading's own id so a section can point `aria-labelledby`
 * at it.
 */
export function SectionHeading({
  eyebrow,
  children,
  id,
  className = "",
}: {
  eyebrow: string;
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="lp-eyebrow">{eyebrow}</p>
      <h2
        id={id}
        className="lp-serif mt-5 text-4xl leading-[1.08] text-foreground sm:text-[2.75rem]"
      >
        {children}
      </h2>
    </div>
  );
}
