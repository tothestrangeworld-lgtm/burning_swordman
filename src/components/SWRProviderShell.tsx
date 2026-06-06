// src/components/SWRProviderShell.tsx
// =====================================================================
// 燃えろ剣士 - SWRConfig プロバイダー
// アプリ全体を SWR の永続化キャッシュ + 共通設定で包む
// 「localStorage → メモリ復元 → 即時表示 → 裏で再検証」の4層キャッシュの起点
// =====================================================================

'use client';

import { SWRConfig } from 'swr';
import { useMemo } from 'react';
import { createPersistedCache } from '@/lib/swrCache';
import { SWR_BASE_CONFIG }      from '@/lib/api';

interface Props {
  children: React.ReactNode;
}

export default function SWRProviderShell({ children }: Props) {
  // useMemo でキャッシュインスタンスを1回だけ生成（再レンダリング時も維持）
  const provider = useMemo(() => {
    const cache = createPersistedCache();
    return () => cache;
  }, []);

  return (
    <SWRConfig
      value={{
        ...SWR_BASE_CONFIG,
        provider,
      }}
    >
      {children}
    </SWRConfig>
  );
}
