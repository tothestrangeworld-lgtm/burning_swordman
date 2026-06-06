// src/app/layout.tsx
// =====================================================================
// 燃えろ剣士 - ルートレイアウト
// SWRConfig + BottomNav でアプリ全体を包む
// =====================================================================

import type { Metadata, Viewport } from 'next';
import './globals.css';

import SWRProviderShell from '@/components/SWRProviderShell';
import BottomNav        from '@/components/BottomNav';

// =====================================================================
// メタデータ
// =====================================================================
export const metadata: Metadata = {
  title:       '燃えろ剣士',
  description: '小学生剣士のための稽古記録アプリ',
};

export const viewport: Viewport = {
  width:        'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor:   '#B22222',
};

// =====================================================================
// レイアウト本体
// =====================================================================
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <link rel="icon" href="data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E🔥%3C/text%3E%3C/svg%3E" />
      </head>
      <body
        style={{
          margin:         0,
          padding:        0,
          fontFamily:     `'M PLUS Rounded 1c', 'Hiragino Maru Gothic ProN', 'Yu Gothic', sans-serif`,
          backgroundColor: '#8B0000',
          color:          '#FFFFFF',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
        }}
      >
        <SWRProviderShell>
          {/* メインコンテンツ：BottomNav分のpadding-bottomを確保 */}
          <main
            style={{
              minHeight:     '100vh',
              paddingBottom: 'calc(72px + env(safe-area-inset-bottom, 0))',
            }}
          >
            {children}
          </main>

          {/* 固定ボトムナビ */}
          <BottomNav />
        </SWRProviderShell>
      </body>
    </html>
  );
}
