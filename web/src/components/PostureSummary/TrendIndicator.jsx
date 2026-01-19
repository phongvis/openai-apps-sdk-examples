import React from 'react';

const getColor = (comparison) => {
  switch (comparison) {
    case 'above':
      return 'var(--color-green-500)';
    case 'below':
      return 'var(--color-red-500)';
    default:
      return 'var(--color-text-tertiary)';
  }
};

const TrendIndicator = ({ comparison, size = 16 }) => {
  const color = getColor(comparison);
  const strokeWidth = Math.max(1.5, size * 0.1);

  const path = (() => {
    if (comparison === 'above') {
      return 'M4 10 L8 6 L12 10 M8 6 L8 12';
    }
    if (comparison === 'below') {
      return 'M4 8 L8 12 L12 8 M8 12 L8 6';
    }
    return 'M4 9 L12 9';
  })();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-label={`Trend ${comparison}`}
      role="img"
    >
      <circle cx="8" cy="8" r="7" fill={color} opacity={0.15} />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default TrendIndicator;
