import type { CanvasFile } from './types';

/**
 * 画布里的图片体积很大（一张 1024×1024 的图 base64 就有一两 MB），
 * 全塞进 localStorage 会直接撑爆 5MB 配额。所以草稿里只留一个引用，
 * 图片本体放进 IndexedDB（配额几百 MB），读草稿时再补回来。
 */

export const IMAGE_REF_PREFIX = 'idb:';
/** 小于这个体积的图（模拟模式的占位 SVG 之类）继续内联，导出单文件仍然自洽。 */
export const INLINE_IMAGE_LIMIT = 16 * 1024;

export type ImageStore = {
  put(key: string, dataUrl: string): Promise<void>;
  get(key: string): Promise<string | null>;
};

export function isImageRef(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(IMAGE_REF_PREFIX);
}

/** 内容指纹：同一张图复用同一个键，避免节点和对话记录里各存一份。 */
function imageKey(dataUrl: string): string {
  let first = 0x811c9dc5;
  let second = 0x01000193;
  for (let index = 0; index < dataUrl.length; index += 1) {
    const code = dataUrl.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(36)}.${(second >>> 0).toString(36)}.${dataUrl.length.toString(36)}`;
}

export function createMemoryImageStore(): ImageStore {
  const images = new Map<string, string>();
  return {
    put: async (key, dataUrl) => {
      images.set(key, dataUrl);
    },
    get: async (key) => images.get(key) ?? null,
  };
}

const DB_NAME = 'ai-canvas';
const STORE_NAME = 'images';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('图片仓库打不开'));
  });
}

export function createIndexedDbImageStore(): ImageStore {
  let connection: Promise<IDBDatabase> | null = null;
  const database = () => (connection ??= openDatabase());

  return {
    async put(key, dataUrl) {
      const db = await database();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).put(dataUrl, key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error('图片写入失败'));
      });
    },
    async get(key) {
      const db = await database();
      return await new Promise<string | null>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const request = transaction.objectStore(STORE_NAME).get(key);
        request.onsuccess = () =>
          resolve(typeof request.result === 'string' ? request.result : null);
        request.onerror = () => reject(request.error ?? new Error('图片读取失败'));
      });
    },
  };
}

let cached: ImageStore | null = null;

/** 浏览器里用 IndexedDB；跑测试或没有 IndexedDB 时退回内存。 */
export function defaultImageStore(): ImageStore {
  if (!cached) {
    cached = typeof indexedDB === 'undefined' ? createMemoryImageStore() : createIndexedDbImageStore();
  }
  return cached;
}

async function transform(
  value: unknown,
  onString: (text: string) => Promise<unknown>,
): Promise<unknown> {
  if (typeof value === 'string') return onString(value);
  if (Array.isArray(value)) {
    const items: unknown[] = [];
    for (const item of value) items.push(await transform(item, onString));
    return items;
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) result[key] = await transform(item, onString);
    return result;
  }
  return value;
}

/** 把大图搬进图片仓库，画布文件里只留引用。 */
export async function extractImages(
  file: CanvasFile,
  store: ImageStore = defaultImageStore(),
): Promise<CanvasFile> {
  const pending = new Map<string, string>();

  const slim = await transform(file, async (text) => {
    if (isImageRef(text)) return text;
    if (!text.startsWith('data:') || text.length < INLINE_IMAGE_LIMIT) return text;
    const ref = `${IMAGE_REF_PREFIX}${imageKey(text)}`;
    pending.set(ref, text);
    return ref;
  });

  for (const [ref, dataUrl] of pending) await store.put(ref, dataUrl);
  return slim as CanvasFile;
}

/** 把引用换回图片本体；本体丢了就清空该字段，不留坏地址。 */
export async function restoreImages(
  file: CanvasFile,
  store: ImageStore = defaultImageStore(),
): Promise<CanvasFile> {
  const cache = new Map<string, string | null>();

  const restored = await transform(file, async (text) => {
    if (!isImageRef(text)) return text;
    if (!cache.has(text)) cache.set(text, await store.get(text));
    return cache.get(text) ?? null;
  });

  return restored as CanvasFile;
}
