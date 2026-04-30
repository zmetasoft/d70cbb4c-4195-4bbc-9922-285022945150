import type { ReactNode } from 'react';

const toneClassName = {
  success: 'status-pill status-pill-success',
  warning: 'status-pill status-pill-warning',
  danger: 'status-pill status-pill-danger',
  info: 'status-pill status-pill-info',
};

export function StatusPill({
  children,
  tone,
}: {
  children: ReactNode;
  tone: string;
}) {
  const className = toneClassName[tone as keyof typeof toneClassName] ?? toneClassName.info;

  return <span className={className}>{children}</span>;
}
