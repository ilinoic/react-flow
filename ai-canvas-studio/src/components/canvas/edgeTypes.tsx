'use client';

import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';

export function ReferenceEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
}: EdgeProps) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <BaseEdge
      path={path}
      style={{
        stroke: selected ? '#4338ca' : '#94a3b8',
        strokeWidth: 1.5,
        strokeDasharray: '6 4',
      }}
    />
  );
}

export const edgeTypes = { reference: ReferenceEdge };
