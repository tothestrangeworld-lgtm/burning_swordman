// src/app/layout.tsx
// =====================================================================
// 燃えよ剣士 - ルートレイアウト
// アプリ全体でSWR永続化キャッシュとフォント・メタ情報を設定する
// =====================================================================

'use client';

import { SWRConfig } from 'swr';
import { createPersistedCache } from '@/lib/swrCache';
import './globals.css';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <head>
        <title>燃えよ剣士</title>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
        />
        <meta name="theme-color" content="#B22222" />
        <meta
          name="description"
          content="小学生剣士のための修行記録アプリ。日々の稽古を記録して、剣聖を目指そう！"
        />
        <link rel="icon" href="/favicon.ico" />
        {/* PWA対応（Phase 8で本実装） */}
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body
        style={{
          margin:        0,
          padding:       0,
          fontFamily:
            '"Hiragino Sans", "Yu Gothic", "Meiryo", "Noto Sans JP", sans-serif',
          backgroundColor: '#FFFFFF',
          color:           '#2B2B2B',
          minHeight:       '100vh',
          WebkitFontSmoothing: 'antialiased',
        }}
      >
        <SWRConfig
          value={{
            provider:              createPersistedCache,
            revalidateIfStale:     false,
            revalidateOnFocus:     false,
            revalidateOnReconnect: true,
            keepPreviousData:      true,
          }}
        >
          {children}
        </SWRConfig>
      </body>
    </html>
  );
}
