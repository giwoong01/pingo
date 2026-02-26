import React from 'react';

type PingoLogoProps = {
  size?: 'sm' | 'md' | 'lg';
  withText?: boolean;
  className?: string;
};

const sizeClassMap: Record<NonNullable<PingoLogoProps['size']>, string> = {
  sm: 'w-7 h-7',
  md: 'w-8 h-8',
  lg: 'w-10 h-10',
};

export default function PingoLogo({ size = 'md', withText = true, className = '' }: PingoLogoProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`.trim()}>
      <svg
        viewBox="0 0 40 40"
        role="img"
        aria-label="Pingo logo"
        className={sizeClassMap[size]}
      >
        <defs>
          <linearGradient id="pingo-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#38BDF8" />
            <stop offset="100%" stopColor="#2563EB" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="36" height="36" rx="11" fill="url(#pingo-gradient)" />
        <circle cx="20" cy="20" r="8" fill="#FFFFFF" opacity="0.95" />
        <circle cx="20" cy="20" r="3.5" fill="#2563EB" />
        <circle cx="28.3" cy="11.7" r="2.3" fill="#FFFFFF" opacity="0.95" />
      </svg>

      {withText && <span className="text-xl font-bold tracking-tight text-gray-900">Pingo</span>}
    </div>
  );
}
