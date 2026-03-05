import React from 'react';

interface SkeletonPulseProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: number;
}

export default function SkeletonPulse({
  width = '100%',
  height = 16,
  borderRadius = 8,
}: SkeletonPulseProps) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius,
        background: 'linear-gradient(90deg, var(--bg-input) 25%, rgba(120,120,128,0.12) 50%, var(--bg-input) 75%)',
        backgroundSize: '200% 100%',
        animation: 'skeletonShimmer 1.5s ease-in-out infinite',
      }}
    />
  );
}
