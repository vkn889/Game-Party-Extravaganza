import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  // Primary: purple with peach text; secondary: mint with plum text (PRD §4).
  primary: 'bg-purple text-peach hover:brightness-110 shadow-card-sm active:translate-y-0.5 active:shadow-none',
  secondary: 'bg-mint text-plum hover:brightness-105 shadow-card-sm active:translate-y-0.5 active:shadow-none',
  ghost: 'bg-transparent text-peach ring-2 ring-peach/40 hover:bg-plum-raised',
  danger: 'bg-plum-deep text-peach ring-2 ring-pink/60 hover:bg-plum-raised',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'md' | 'lg';
  block?: boolean;
}

/** Buttons are at least 48 px tall (PRD §2 phone rules). */
export function Button({ variant = 'primary', size = 'md', block = false, className = '', type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`font-display inline-flex items-center justify-center gap-2 rounded-2xl px-5 font-semibold transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-45 ${
        size === 'lg' ? 'min-h-14 text-xl' : 'min-h-12 text-lg'
      } ${block ? 'w-full' : ''} ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  );
}
