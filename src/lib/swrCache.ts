// src/lib/swrCache.ts
// =====================================================================
// 燃えろ剣士 - SWR永続化キャッシュ
// localStorage を使ってSWRキャッシュを保持し、初回ロード体感速度を最大化
// TTL: 30分。期限切れデータは「即座に表示しつつ裏で再検証」される
// =====================================================================

import type { Cache, State } from 'swr';

const CACHE_KEY = 'burning_swordman_swr_cache';
const TTL_MS    = 30 * 60 * 1000; // 30分

interface PersistedEntry {
  data:      unknown;
  timestamp: number;
}

interface PersistedCache {
  [key: string]: PersistedEntry;
}

// =====================================================================
// localStorage 安全アクセス
// =====================================================================
function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function loadAll(): PersistedCache {
  if (!isBrowser()) return {};
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PersistedCache;
    return parsed || {};
  } catch {
    return {};
  }
}

function saveAll(cache: PersistedCache): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (err) {
    // QuotaExceededError 等は無視（容量オーバーは致命的ではない）
    console.warn('[swrCache] 保存失敗:', err);
  }
}

// =====================================================================
// TTL チェック
// =====================================================================
function isExpired(entry: PersistedEntry): boolean {
  return Date.now() - entry.timestamp > TTL_MS;
}

// =====================================================================
// SWR Cache Provider（メイン関数）
// SWRConfig の provider に渡す
// =====================================================================
export function createPersistedCache(): Cache {
  const map = new Map<string, State>();

  // 初回ロード時、有効な永続化データをメモリへ復元
  if (isBrowser()) {
    const persisted = loadAll();
    Object.entries(persisted).forEach(([key, entry]) => {
      if (isExpired(entry)) return;
      map.set(key, { data: entry.data } as State);
    });
  }

  return {
    get(key: string): State | undefined {
      return map.get(key);
    },
    set(key: string, value: State): void {
      map.set(key, value);
      // data が確定したタイミングで永続化
      if (value && (value as { data?: unknown }).data !== undefined) {
        const persisted = loadAll();
        persisted[key] = {
          data:      (value as { data: unknown }).data,
          timestamp: Date.now(),
        };
        saveAll(persisted);
      }
    },
    delete(key: string): void {
      map.delete(key);
      const persisted = loadAll();
      if (persisted[key]) {
        delete persisted[key];
        saveAll(persisted);
      }
    },
    keys(): IterableIterator<string> {
      return map.keys();
    },
  };
}

// =====================================================================
// キャッシュ全削除（ログアウト時に呼ぶ）
// =====================================================================
export function clearPersistedCache(): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (err) {
    console.warn('[swrCache] 削除失敗:', err);
  }
}

// =====================================================================
// 特定キーのみ削除（細かい無効化用）
// =====================================================================
export function invalidatePersistedKey(key: string): void {
  if (!isBrowser()) return;
  try {
    const persisted = loadAll();
    if (persisted[key]) {
      delete persisted[key];
      saveAll(persisted);
    }
  } catch (err) {
    console.warn('[swrCache] 個別削除失敗:', err);
  }
}

// =====================================================================
// デバッグ用：現在のキャッシュ状態を取得
// =====================================================================
export function getCacheSnapshot(): {
  count:     number;
  totalSize: number;
  keys:      string[];
} {
  if (!isBrowser()) return { count: 0, totalSize: 0, keys: [] };
  const persisted = loadAll();
  const raw = localStorage.getItem(CACHE_KEY) || '';
  return {
    count:     Object.keys(persisted).length,
    totalSize: raw.length,
    keys:      Object.keys(persisted),
  };
}
