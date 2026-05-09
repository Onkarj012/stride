export function PageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-8">
      <h1 className="text-4xl lg:text-5xl font-heading uppercase tracking-normal leading-none">
        {title}
      </h1>
      {subtitle && (
        <p className="text-sm font-mono text-[var(--text-muted)] mt-2 tracking-wide">
          {subtitle}
        </p>
      )}
    </div>
  );
}
