import Link from 'next/link';
import { SectionHelp } from './section-help';

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  help?: string;
  action?: { label: string; href: string };
};

/** Consistent page title block for hub panels. */
export function PageHeader({ title, subtitle, help, action }: PageHeaderProps) {
  return (
    <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-start gap-2">
          <h1 className="page-title">{title}</h1>
          {help && (
            <SectionHelp label={`How to use ${title}`} className="mt-1.5 shrink-0">
              {help}
            </SectionHelp>
          )}
        </div>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {action && (
        <Link href={action.href} className="btn-primary text-sm">
          {action.label}
        </Link>
      )}
    </header>
  );
}
