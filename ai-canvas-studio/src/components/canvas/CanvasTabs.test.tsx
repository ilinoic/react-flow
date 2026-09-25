import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CanvasTabs } from './CanvasTabs';
import type { LocalCanvas } from '@/lib/canvas/localCanvases';

const canvases: LocalCanvas[] = [
  { id: 'a', name: '第一张', projectId: null, updatedAt: '2026-09-24T00:00:00.000Z' },
  { id: 'b', name: '第二张', projectId: 'p-1', updatedAt: '2026-09-24T01:00:00.000Z' },
];

function setup(overrides: Partial<Parameters<typeof CanvasTabs>[0]> = {}) {
  const props = {
    canvases,
    open: ['a', 'b'],
    activeId: 'b',
    onActivate: vi.fn(),
    onClose: vi.fn(),
    onCreate: vi.fn(),
    ...overrides,
  };
  render(<CanvasTabs {...props} />);
  return props;
}

describe('画布标签栏', () => {
  it('每个打开的画布一个标签，名字对得上', () => {
    setup();
    expect(screen.getByRole('button', { name: '切换到画布 第一张' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '切换到画布 第二张' })).toBeInTheDocument();
  });

  it('当前画布标成 aria-current', () => {
    setup();
    expect(screen.getByRole('button', { name: '切换到画布 第二张' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: '切换到画布 第一张' })).not.toHaveAttribute('aria-current');
  });

  it('点标签切过去，点叉关掉，点加号新建', async () => {
    const props = setup();

    await userEvent.click(screen.getByRole('button', { name: '切换到画布 第一张' }));
    expect(props.onActivate).toHaveBeenCalledWith('a');

    await userEvent.click(screen.getByRole('button', { name: '关闭 第二张' }));
    expect(props.onClose).toHaveBeenCalledWith('b');

    await userEvent.click(screen.getByRole('button', { name: '新建画布' }));
    expect(props.onCreate).toHaveBeenCalled();
  });

  it('打开列表里指向的画布不见了就不画那个标签，也不炸', () => {
    setup({ open: ['a', 'ghost'] });
    expect(screen.getAllByRole('button', { name: /切换到画布/ })).toHaveLength(1);
  });
});
