import { parseCanvasFile } from './serialization';
import type { CanvasFile } from './types';

/**
 * 站点自带的画布模板：文件放在 `public/templates` 下，随站点一起发布。
 * 打开模板走「新开一个画布标签」，当前这张画布不受影响。
 */
export type CanvasTemplate = {
  id: string;
  name: string;
  /** public 下的静态路径，线上由站点直接发，不依赖任何会过期的地址。 */
  path: string;
  /** 菜单里那行小字，说明这个模板是干嘛的。 */
  hint: string;
};

export const CANVAS_TEMPLATES: CanvasTemplate[] = [
  {
    id: 'image-pipeline-demo',
    name: '出图三连 · 成品示例',
    path: '/templates/image-pipeline-demo.json',
    hint: '提示词 → 出图 → 改图，两张成品图已经在画布上',
  },
  {
    id: 'image-pipeline',
    name: '出图三连 · 空白起手',
    path: '/templates/image-pipeline.json',
    hint: '同样的连线，图还没生成，从零开始画',
  },
];

export async function fetchTemplate(path: string): Promise<CanvasFile> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`模板读取失败（${response.status}）`);
  return parseCanvasFile(await response.text());
}

/** 第一次打开网站时直接送的那张：带成品图的示例，先让人看到成品长什么样。 */
export const WELCOME_TEMPLATE = CANVAS_TEMPLATES[0];
