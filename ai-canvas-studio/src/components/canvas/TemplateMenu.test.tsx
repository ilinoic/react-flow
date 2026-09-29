import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TemplateMenu } from './TemplateMenu';
import { CANVAS_TEMPLATES } from '@/lib/canvas/templates';

describe('模板菜单', () => {
  it('点「模板」才展开，列的是站点自带的画布模板', async () => {
    render(<TemplateMenu onOpenTemplate={vi.fn()} />);
    expect(screen.queryByTestId('template-menu')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: '画布模板' }));

    expect(screen.getByTestId('template-menu')).toBeInTheDocument();
    for (const template of CANVAS_TEMPLATES) {
      expect(screen.getByRole('button', { name: `从模板打开 ${template.name}` })).toBeInTheDocument();
    }
  });

  it('挑一个模板就交给上层，并收起菜单', async () => {
    const onOpenTemplate = vi.fn();
    render(<TemplateMenu onOpenTemplate={onOpenTemplate} />);

    await userEvent.click(screen.getByRole('button', { name: '画布模板' }));
    await userEvent.click(
      screen.getByRole('button', { name: `从模板打开 ${CANVAS_TEMPLATES[0].name}` }),
    );

    expect(onOpenTemplate).toHaveBeenCalledWith(CANVAS_TEMPLATES[0]);
    expect(screen.queryByTestId('template-menu')).toBeNull();
  });

  it('按 Esc 收起菜单', async () => {
    render(<TemplateMenu onOpenTemplate={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: '画布模板' }));
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByTestId('template-menu')).toBeNull();
  });
});
