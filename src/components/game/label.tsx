import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('text-[0.7rem] font-medium tracking-[0.12em] text-muted-foreground uppercase', className)}>{children}</div>;
}

export function Muted({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-sm text-muted-foreground', className)}>{children}</p>;
}
