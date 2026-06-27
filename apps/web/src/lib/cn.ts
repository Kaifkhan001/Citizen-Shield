// Tiny class-name combinator. Wraps `clsx` so callers can do
// `cn('base', condition && 'extra')` without importing clsx everywhere.
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
