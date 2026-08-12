'use client';

import {
  forwardRef,
  type FormHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from 'react';

export const BensonMessageList = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & { children: ReactNode }
>(function BensonMessageList({ children, className = '', ...props }, ref) {
  return (
    <div
      ref={ref}
      className={`min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 [-webkit-overflow-scrolling:touch] ${className}`}
      {...props}
    >
      {children}
    </div>
  );
});

export const BensonComposer = forwardRef<
  HTMLFormElement,
  FormHTMLAttributes<HTMLFormElement> & { children: ReactNode }
>(function BensonComposer({ children, className = '', ...props }, ref) {
  return (
    <form
      ref={ref}
      className={`shrink-0 border-t border-white/10 bg-black/30 p-3 backdrop-blur-md ${className}`}
      {...props}
    >
      {children}
    </form>
  );
});
