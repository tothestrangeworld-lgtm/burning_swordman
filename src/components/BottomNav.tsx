// src/components/BottomNav.tsx
// =====================================================================
// 燃えよ剣士 - ボトムナビゲーション
// 小学生剣士がスマホでサクサク画面遷移できる下部固定ナビ
// ロール（生徒/先生）に応じて表示メニューを切替
// =====================================================================

'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getAuthUser, logoutAndRedirect } from '@/lib/auth';
import { THEME } from '@/types';

// =====================================================================
// アイコン（自作SVG・依存ライブラリ不要）
// =====================================================================

interface IconProps {
  size?:   number;
  color:   string;
  active?: boolean;
}

function HomeIcon({ size = 24, color, active }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={active ? 2.5 : 2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1h-5v-7h-6v7H4a1 1 0 01-1-1V9.5z" />
    </svg>
  );
}

function RecordIcon({ size = 24, color, active }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={active ? 2.5 : 2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function UsersIcon({ size = 24, color, active }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={active ? 2.5 : 2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}

function LogOutIcon({ size = 24, color, active }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={active ? 2.5 : 2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

// =====================================================================
// メニュー定義
// =====================================================================

type IconComponent = (props: IconProps) => React.ReactElement;

interface NavItem {
  key:    string;
  label:  string;
  href?:  string;          // 遷移先（undefined = アクション）
  action?: 'logout';       // アクション種別
  icon:   IconComponent;
  emoji:  string;          // 補助絵文字
}

const STUDENT_ITEMS: NavItem[] = [
  { key: 'home',   label: 'ホーム',   href: '/',       icon: HomeIcon,   emoji: '🏠' },
  { key: 'record', label: 'きろく',   href: '/record', icon: RecordIcon, emoji: '📝' },
  { key: 'logout', label: '退場',     action: 'logout', icon: LogOutIcon, emoji: '🚪' },
];

const TEACHER_ITEMS: NavItem[] = [
  { key: 'students', label: 'もんかせい', href: '/teacher', icon: UsersIcon,  emoji: '👥' },
  { key: 'logout',   label: '退場',       action: 'logout', icon: LogOutIcon, emoji: '🚪' },
];

// 表示しないパス
const HIDDEN_PATHS = ['/login'];

// =====================================================================
// メインコンポーネント
// =====================================================================

export default function BottomNav() {
  const router   = useRouter();
  const pathname = usePathname() ?? '/';

  // ハイドレーション対策：マウント後にユーザー情報を取得
  const [mounted, setMounted] = useState(false);
  const [role, setRole]       = useState<'student' | 'teacher' | null>(null);

  useEffect(() => {
    setMounted(true);
    const user = getAuthUser();
    setRole(user?.role ?? null);
  }, [pathname]); // パス変化時もチェック（ログイン直後の更新用）

  // ===================================================================
  // 表示制御
  // ===================================================================
  if (!mounted) return null;
  if (HIDDEN_PATHS.includes(pathname)) return null;
  if (!role) return null; // 未ログイン

  const items: NavItem[] = role === 'teacher' ? TEACHER_ITEMS : STUDENT_ITEMS;

  // ===================================================================
  // ハンドラ
  // ===================================================================
  const handleClick = (item: NavItem) => {
    if (item.action === 'logout') {
      const ok = window.confirm('道場を出ますか？');
      if (ok) {
        logoutAndRedirect();
      }
      return;
    }
    if (item.href && item.href !== pathname) {
      router.push(item.href);
    }
  };

  // 現在地の判定
  const isActive = (item: NavItem): boolean => {
    if (!item.href) return false;
    if (item.href === '/') return pathname === '/';
    return pathname === item.href || pathname.startsWith(item.href + '/');
  };

  // ===================================================================
  // レンダリング
  // ===================================================================
  return (
    <>
      {/* セーフエリア用スペーサー（iOSのホームバー対応） */}
      <nav style={styles.nav} role="navigation" aria-label="メインナビゲーション">
        <div style={styles.inner}>
          {items.map((item) => {
            const active = isActive(item);
            const isAction = item.action !== undefined;
            const Icon = item.icon;

            // アクションボタン（ログアウト）の色は控えめに
            const itemColor = active
              ? THEME.accent
              : isAction
                ? THEME.textSubtle
                : THEME.textMuted;

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handleClick(item)}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                style={{
                  ...styles.item,
                  ...(active ? styles.itemActive : {}),
                }}
                onTouchStart={(e) => {
                  e.currentTarget.style.transform = 'scale(0.92)';
                }}
                onTouchEnd={(e) => {
                  e.currentTarget.style.transform = active ? 'scale(1.05)' : 'scale(1)';
                }}
                onMouseDown={(e) => {
                  e.currentTarget.style.transform = 'scale(0.95)';
                }}
                onMouseUp={(e) => {
                  e.currentTarget.style.transform = active ? 'scale(1.05)' : 'scale(1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = active ? 'scale(1.05)' : 'scale(1)';
                }}
              >
                {/* アクティブインジケーター（上部の臙脂ライン） */}
                {active && <div style={styles.indicator} aria-hidden="true" />}

                <div style={styles.iconWrap}>
                  <Icon
                    size={active ? 26 : 22}
                    color={itemColor}
                    active={active}
                  />
                </div>

                <span style={{
                  ...styles.label,
                  color:      itemColor,
                  fontWeight: active ? 900 : 700,
                  fontSize:   active ? '12px' : '11px',
                }}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* iOSセーフエリア吸収 */}
        <div style={styles.safeArea} aria-hidden="true" />
      </nav>

      <style>{`
        @keyframes burning_nav_pop {
          0%   { transform: scale(0.8); opacity: 0; }
          60%  { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </>
  );
}

// =====================================================================
// スタイル
// =====================================================================

const styles: Record<string, React.CSSProperties> = {
  nav: {
    position:        'fixed',
    bottom:          0,
    left:            0,
    right:           0,
    backgroundColor: THEME.bgCard,
    borderTop:       `2px solid ${THEME.borderSolid}`,
    boxShadow:       '0 -4px 20px rgba(0,0,0,0.45)',
    zIndex:          100,
    paddingBottom:   'env(safe-area-inset-bottom, 0)',
  },
  inner: {
    maxWidth:    '720px',
    margin:      '0 auto',
    display:     'flex',
    justifyContent: 'space-around',
    alignItems:  'stretch',
    minHeight:   '64px',
  },
  item: {
    flex:           1,
    minHeight:      '64px',
    padding:        '6px 4px 8px',
    backgroundColor: 'transparent',
    border:         'none',
    cursor:         'pointer',
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            '4px',
    position:       'relative',
    transition:     'transform 0.15s ease',
    fontFamily:     'inherit',
    WebkitTapHighlightColor: 'transparent',
  },
  itemActive: {
    transform:       'scale(1.05)',
    backgroundColor: THEME.bgCardDeep,
  },
  indicator: {
    position:        'absolute',
    top:             0,
    left:            '20%',
    right:           '20%',
    height:          '3px',
    backgroundColor: THEME.accent,
    borderRadius:    '0 0 3px 3px',
    boxShadow:       '0 2px 8px rgba(255,215,0,0.45)',
    animation:       'burning_nav_pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both',
  },
  iconWrap: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    height:         '28px',
    transition:     'transform 0.15s ease',
  },
  label: {
    letterSpacing: '0.05em',
    transition:    'all 0.15s ease',
    lineHeight:    1,
  },
  safeArea: {
    height:          'env(safe-area-inset-bottom, 0)',
    backgroundColor: '#FFFFFF',
  },
};
