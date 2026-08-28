import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

interface Props extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Card({ className, children, ...rest }: Props) {
  return (
    <div
      {...rest}
      className={cn('rounded-lg border border-border bg-surface p-sp-5 shadow-sm', className)}
    >
      {children}
    </div>
  );
}
