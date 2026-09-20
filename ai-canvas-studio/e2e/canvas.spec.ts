import { expect, test } from '@playwright/test';

const svgDataUrl =
  'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E';

test('画布核心流程：加节点 → 撤销重做 → 导出 JSON', async ({ page }) => {
  test.skip(!process.env.E2E_EMAIL, '需要提供 E2E_EMAIL / E2E_PASSWORD 测试账号');

  await page.route('**/api/ai/generate', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ imageSrc: svgDataUrl }),
    }),
  );

  await page.goto('/login');
  await page.getByLabel('邮箱').fill(process.env.E2E_EMAIL!);
  await page.getByLabel('密码').fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL('**/canvas');

  await page.getByRole('button', { name: '添加文本节点' }).click();
  await page.getByRole('button', { name: '添加图片节点' }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(2);

  await page.getByRole('button', { name: '撤销' }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await page.getByRole('button', { name: '重做' }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(2);

  const download = page.waitForEvent('download');
  await page.locator('.react-flow__pane').click({ button: 'right' });
  await page.getByRole('button', { name: '导出画布 JSON' }).click();
  expect((await download).suggestedFilename()).toContain('canvas-');
});
