import { describe, expect, it } from 'vitest';
import { canvasImagePath } from './upload';

describe('canvasImagePath', () => {
  it('把用户 id 作为目录前缀', () => {
    expect(canvasImagePath('user-1', 'photo.PNG', new Date(1000))).toBe('user-1/1000-photo.PNG');
  });

  it('文件名里的路径分隔符与空格换成下划线', () => {
    expect(canvasImagePath('u', 'a/b\\c d.png', new Date(1))).toBe('u/1-a_b_c_d.png');
  });
});
