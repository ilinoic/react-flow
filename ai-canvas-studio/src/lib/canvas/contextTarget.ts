/**
 * 右键点的位置是不是「正在输入的地方」。
 *
 * 画布自己的右键菜单里有「粘贴」，那是往画布上贴节点。如果用户在提示词输入框里
 * 右键，弹这个菜单就把「粘贴文字」给抢走了，所以这种情况要让浏览器原生菜单来处理。
 */
export function isTextInputTarget(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false;
  const element = target as { tagName?: unknown; isContentEditable?: unknown };
  if (element.isContentEditable === true) return true;
  const tag = typeof element.tagName === 'string' ? element.tagName.toUpperCase() : '';
  return tag === 'TEXTAREA' || tag === 'INPUT';
}
