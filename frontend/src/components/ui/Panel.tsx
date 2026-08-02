import type { ReactNode } from "react";

export function Panel({
  label,
  aside,
  children,
  className = "",
  bodyClassName = "",
}: {
  label?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`panel flex min-h-0 min-w-0 flex-col overflow-hidden ${className}`}>
      {label ? (
        <header className="flex items-center justify-between gap-3 border-b border-rule px-3 py-2">
          <h2 className="eyebrow">{label}</h2>
          {aside ? <div className="eyebrow text-ink-2">{aside}</div> : null}
        </header>
      ) : null}
      <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  );
}
