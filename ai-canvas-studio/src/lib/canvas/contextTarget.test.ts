import { describe, expect, it } from 'vitest';
import { isTextInputTarget } from './contextTarget';

const element = (tagName: string, isContentEditable = false) => ({ tagName, isContentEditable });

describe('右键目标判断', () => {
  it('点在提示词输入框（textarea）里算输入中', () => {
    expect(isTextInputTarget(element('TEXTAREA'))).toBe(true);
  });

  it('点在 input 里算输入中', () => {
    expect(isTextInputTarget(element('INPUT'))).toBe(true);
  });

  it('点在小写标签名的输入框里也算', () => {
    expect(isTextInputTarget(element('textarea'))).toBe(true);
  });

  it('点在 contenteditable 区域里算输入中', () => {
    expect(isTextInputTarget(element('DIV', true))).toBe(true);
  });

  it('点在画布空白处不算输入中', () => {
    expect(isTextInputTarget(element('DIV'))).toBe(false);
    expect(isTextInputTarget(element('svg'))).toBe(false);
  });

  it('没有目标（或不是元素）时不算输入中', () => {
    expect(isTextInputTarget(null)).toBe(false);
    expect(isTextInputTarget(undefined)).toBe(false);
    expect(isTextInputTarget({})).toBe(false);
  });
});
