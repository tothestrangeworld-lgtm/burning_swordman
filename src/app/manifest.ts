// src/app/manifest.ts
import { MetadataRoute } from 'next';
import { THEME } from '@/types'; // 既存のテーマカラーを読み込む

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '燃えよ剣士 - 稽古記録',
    short_name: '燃えよ剣士', // ホーム画面に表示される短い名前
    description: '熱血剣道道場のための稽古記録・XP管理アプリ',
    start_url: '/',
    display: 'standalone', // URLバーを消して全画面の「本物のアプリ」っぽくする設定
    background_color: '#1a1a1a', // 起動時の背景色（ダークテーマ）
    theme_color: THEME.primary,  // 臙脂色（えんじいろ）
    icons: [
      {
        src: '/icon.png', // 先ほど配置したアイコンを自動参照します
        sizes: 'any',
        type: 'image/png',
      },
    ],
  };
}