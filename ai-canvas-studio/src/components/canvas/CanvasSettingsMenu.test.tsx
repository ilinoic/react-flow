import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CanvasSettingsMenu } from './CanvasSettingsMenu';
import type { LocalCanvas } from '@/lib/canvas/localCanvases';

const canvases: LocalCanvas[] = [
  { id: 'a', name: '第一张', projectId: null, updatedAt: '2026-09-24T00:00:00.000Z' },
  { id: 'b', name: '第二张', projectId: 'p-1', updatedAt: '2026-09-24T01:00:00.000Z' },
];

function setup(overrides: Partial<Parameters<typeof CanvasSettingsMenu>[0]> = {}) {
  const props = {
    canvases,
    openIds: ['b'],
    onOpenCanvas: vi.fn(),
    onDeleteCanvas: vi.fn(),
    ...overrides,
  };
  render(<CanvasSettingsMenu {...props} />);
  return props;
}

describe('左下角设置菜单', () => {
  afterEach(() => vi.restoreAllMocks());

  it('一开始是收起的', () => {
    setup();
    expect(screen.getByRole('button', { name: '设置' })).toBeInTheDocument();
    expect(screen.queryByTestId('settings-menu')).toBeNull();
  });

  it('展开后能看到本地画布和两个跳转入口', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: '设置' }));

    expect(screen.getByTestId('settings-menu')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '打开 第一张' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '打开 第二张' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'AI 设置' })).toHaveAttribute('href', '/settings');
    expect(screen.getByRole('link', { name: '我的画布（云端）' })).toHaveAttribute('href', '/projects');
  });

  it('已经在标签页里的画布标出来', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: '设置' }));
    expect(screen.getByRole('button', { name: '打开 第二张' })).toHaveTextContent('第二张');
    expect(screen.getByText('已打开')).toBeInTheDocument();
  });

  it('点画布就是打开它，菜单收起', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('button', { name: '设置' }));
    await userEvent.click(screen.getByRole('button', { name: '打开 第一张' }));

    expect(props.onOpenCanvas).toHaveBeenCalledWith('a');
    expect(screen.queryByTestId('settings-menu')).toBeNull();
  });

  it('删除本地画布要点两次：第一次变成「再点一次」，第二次才真删', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('button', { name: '设置' }));

    await userEvent.click(screen.getByRole('button', { name: '删除本地画布 第一张' }));
    expect(props.onDeleteCanvas).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: '删除本地画布 第一张' }));
    expect(props.onDeleteCanvas).toHaveBeenCalledWith('a');
  });

  it('每行带上更新时间，同名的画布也能分清', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: '设置' }));
    // 具体格式随系统 locale 变，这里只确认带上了「几号 几点几分」
    expect(screen.getAllByText(/\d{1,2}[/月]\d{1,2}.*\d{1,2}:\d{2}/).length).toBeGreaterThan(0);
  });
});
