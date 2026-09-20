import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CanvasToolbar } from './CanvasToolbar';
import { useCanvasStore } from '@/lib/canvas/store';

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
});
