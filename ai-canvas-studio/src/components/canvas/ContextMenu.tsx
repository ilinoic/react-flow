'use client';

import { useEffect } from 'react';

export type ContextMenuItem = {
  label: string;
  run: () => void;
  disabled?: boolean;
};

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', close);
    };
  }, [onClose]);

  return (
    <ul
      role="menu"
      style={{ left: x, top: y }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
      className="fixed z-50 w-44 rounded-md border border-gray-200 bg-white py-1 text-sm text-gray-800 shadow-lg"
    >
      {items.map((item) => (
        <li key={item.label}>
          <button
            type="button"
            disabled={item.disabled}
            onClick={() => {
              item.run();
              onClose();
            }}
            className="w-full px-3 py-1.5 text-left hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {item.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
