import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CanvasToolbar } from './CanvasToolbar';
import { useCanvasStore } from '@/lib/canvas/store';
import { clipboardNodeCount } from '@/lib/canvas/clipboard';

const s = () => useCanvasStore.getState();

function setup() {
  const onToolChange = vi.fn();
  const onFitView = vi.fn();
  render(
    <CanvasToolbar
      tool="select"
      onToolChange={onToolChange}
      addPosition={() => ({ x: 0, y: 0 })}
      onFitView={onFitView}
    />,
  );
  return { onToolChange, onFitView };
}

describe('CanvasToolbar 快捷键', () => {
  beforeEach(() => s().reset());
  afterEach(() => vi.useRealTimers());

  it('清空的二次确认会自动取消，避免过一会儿误点真的清空画布', async () => {
    vi.useFakeTimers();
    s().addTextNode({ x: 0, y: 0 });
    setup();

    fireEvent.click(screen.getByRole('button', { name: '清空画布' }));
    expect(screen.getByText('再点一次确认')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.queryByText('再点一次确认')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '清空画布' }));
    expect(s().nodes).toHaveLength(1);
  });

  it('Ctrl+A 全选所有节点', async () => {
    s().addTextNode({ x: 0, y: 0 });
    s().addImageNode({ x: 200, y: 0 });
    s().onNodesChange(s().nodes.map((node) => ({ id: node.id, type: 'select', selected: false })));
    setup();

    await userEvent.keyboard('{Control>}a{/Control}');

    expect(s().nodes.every((node) => node.selected)).toBe(true);
  });

  it('Ctrl+D 复制选中的节点', async () => {
    s().addTextNode({ x: 0, y: 0 });
    setup();

    await userEvent.keyboard('{Control>}d{/Control}');

    expect(s().nodes).toHaveLength(2);
  });

  it('Ctrl+0 触发适配视图', async () => {
    const { onFitView } = setup();

    await userEvent.keyboard('{Control>}0{/Control}');

    expect(onFitView).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+C / Ctrl+X / Ctrl+V 复制、剪切、粘贴', async () => {
    const id = s().addTextNode({ x: 0, y: 0 });
    s().onNodesChange([{ id, type: 'select', selected: true }]);
    setup();

    await userEvent.keyboard('{Control>}c{/Control}');
    await userEvent.keyboard('{Control>}v{/Control}');
    expect(s().nodes).toHaveLength(2);

    // 粘贴后选中的是刚粘出来的那份，剪切它只该删掉这一份
    await userEvent.keyboard('{Control>}x{/Control}');
    expect(s().nodes).toHaveLength(1);
    await userEvent.keyboard('{Control>}v{/Control}');
    expect(s().nodes).toHaveLength(2);
  });

  it('带 Ctrl 的 V 不会顺手切成选择工具', async () => {
    const onToolChange = vi.fn();
    render(
      <CanvasToolbar
        tool="hand"
        onToolChange={onToolChange}
        addPosition={() => ({ x: 0, y: 0 })}
        onFitView={vi.fn()}
      />,
    );

    await userEvent.keyboard('{Control>}v{/Control}');

    expect(onToolChange).not.toHaveBeenCalled();
  });

  it('在输入框里按 Ctrl+A 不会全选节点', async () => {
    s().addTextNode({ x: 0, y: 0 });
    s().addImageNode({ x: 200, y: 0 });
    s().onNodesChange(s().nodes.map((node) => ({ id: node.id, type: 'select', selected: false })));
    const { onFitView } = setup();

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();
    await userEvent.keyboard('{Control>}a{/Control}');

    expect(s().nodes.some((node) => node.selected)).toBe(false);
    expect(onFitView).not.toHaveBeenCalled();
    textarea.remove();
  });

  it('在输入框里复制文字后，节点剪贴板被清空，回到画布按 Ctrl+V 不会粘出旧节点', async () => {
    const id = s().addTextNode({ x: 0, y: 0 });
    s().onNodesChange([{ id, type: 'select', selected: true }]);
    setup();

    await userEvent.keyboard('{Control>}c{/Control}');
    expect(clipboardNodeCount()).toBe(1);

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();
    await userEvent.keyboard('{Control>}c{/Control}');
    textarea.remove();

    expect(clipboardNodeCount()).toBe(0);

    await userEvent.keyboard('{Control>}v{/Control}');
    expect(s().nodes).toHaveLength(1);
  });

  it('「待定」摆在整个工具栏最上面，在「选择工具」之上', () => {
    setup();
    const labels = screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'));

    expect(labels.indexOf('待定')).toBeGreaterThanOrEqual(0);
    expect(labels.indexOf('待定')).toBeLessThan(labels.indexOf('选择工具 V'));
  });

  it('点「待定」会切到这个状态', async () => {
    const { onToolChange } = setup();

    await userEvent.click(screen.getByRole('button', { name: '待定' }));

    expect(onToolChange).toHaveBeenCalledWith('tbd');
  });

  it('处在待定状态时那个按钮是选中的样子', () => {
    render(
      <CanvasToolbar
        tool="tbd"
        onToolChange={vi.fn()}
        addPosition={() => ({ x: 0, y: 0 })}
        onFitView={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '待定' })).toHaveClass('bg-black');
  });
});
