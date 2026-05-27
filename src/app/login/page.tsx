// src/app/login/page.tsx
// =====================================================================
// 燃えよ剣士 - ログイン画面
// 小学生剣士が「修行を始めるぞ！」とワクワクできる、白×臙脂のヒロイックUI
// =====================================================================

'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { loginUser } from '@/lib/api';
import {
  saveAuthUser,
  getAuthUser,
  getHomePathForRole,
} from '@/lib/auth';

// =====================================================================
// テーマカラー
// =====================================================================
const COLOR = {
  primary:     '#B22222',  // 臙脂
  primaryDark: '#8B1A1A',
  primaryLight:'#D94545',
  bg:          '#FFFFFF',
  bgSoft:      '#FFF8F8',
  bgPattern:   '#FBEFEF',
  text:        '#2B2B2B',
  textMuted:   '#777777',
  error:       '#C0392B',
  errorBg:     '#FDECEA',
  border:      '#E5D8D8',
  gold:        '#D4A017',
} as const;

// =====================================================================
// メインコンポーネント
// =====================================================================
export default function LoginPage() {
  const router = useRouter();

  const [userId, setUserId]       = useState('');
  const [passcode, setPasscode]   = useState('');
  const [error, setError]         = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // すでにログイン済みなら自動的にホームへ
  useEffect(() => {
    const existing = getAuthUser();
    if (existing) {
      router.replace(getHomePathForRole(existing.role));
    }
  }, [router]);

  // ===================================================================
  // ログイン処理
  // ===================================================================
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    // クライアント側軽量バリデーション
    if (!userId.trim()) {
      setError('剣士IDを入力してください');
      return;
    }
    if (!passcode.trim()) {
      setError('合言葉を入力してください');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const user = await loginUser(userId.trim(), passcode.trim());
      saveAuthUser(user);

      // ロールに応じて遷移
      const homePath = getHomePathForRole(user.role);
      router.replace(homePath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ログインに失敗しました';
      setError(msg);
      setIsLoading(false);
    }
  };

  // ===================================================================
  // レンダリング
  // ===================================================================
  return (
    <div style={styles.outer}>
      {/* 和紙風背景パターン（CSSのみ） */}
      <div style={styles.bgPattern} aria-hidden="true" />

      <main style={styles.container}>
        {/* タイトル */}
        <header style={styles.header}>
          <div style={styles.flameRow} aria-hidden="true">
            <span style={styles.flameLeft}>🔥</span>
            <span style={styles.flameRight}>🔥</span>
          </div>
          <h1 style={styles.title}>
            <span style={styles.titleAccent}>燃えよ</span>
            <span style={styles.titleMain}>剣士</span>
          </h1>
          <p style={styles.tagline}>～目指せ、剣聖への道～</p>
          <div style={styles.dividerLine} />
        </header>

        {/* ログインフォーム */}
        <form
          onSubmit={handleSubmit}
          style={styles.form}
          autoComplete="off"
          noValidate
        >
          <h2 style={styles.formTitle}>修行を始める</h2>

          {/* エラー表示 */}
          {error && (
            <div role="alert" style={styles.errorBox}>
              <span style={styles.errorIcon}>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* 剣士ID */}
          <div style={styles.field}>
            <label htmlFor="userId" style={styles.label}>
              剣士ID
            </label>
            <input
              id="userId"
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="例: U0001"
              autoComplete="username"
              autoCapitalize="off"
              spellCheck={false}
              disabled={isLoading}
              style={{
                ...styles.input,
                ...(error && !userId ? styles.inputError : {}),
              }}
            />
          </div>

          {/* 合言葉（パスコード） */}
          <div style={styles.field}>
            <label htmlFor="passcode" style={styles.label}>
              合言葉
            </label>
            <input
              id="passcode"
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="数字を入力"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="current-password"
              maxLength={8}
              disabled={isLoading}
              style={{
                ...styles.input,
                ...(error && !passcode ? styles.inputError : {}),
                letterSpacing: '0.3em',
                fontSize:      '20px',
                textAlign:     'center',
              }}
            />
            <p style={styles.hint}>※ 4〜8桁の数字</p>
          </div>

          {/* ログインボタン */}
          <button
            type="submit"
            disabled={isLoading}
            style={{
              ...styles.button,
              ...(isLoading ? styles.buttonDisabled : {}),
            }}
            onMouseDown={(e) => {
              if (!isLoading) e.currentTarget.style.transform = 'scale(0.97)';
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
            onTouchStart={(e) => {
              if (!isLoading) e.currentTarget.style.transform = 'scale(0.97)';
            }}
            onTouchEnd={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            {isLoading ? (
              <>
                <span style={styles.spinner} aria-hidden="true" />
                <span>修行中...</span>
              </>
            ) : (
              <>
                <span style={styles.buttonIcon}>⚔️</span>
                <span>いざ、参る！</span>
              </>
            )}
          </button>
        </form>

        {/* フッター */}
        <footer style={styles.footer}>
          <p style={styles.footerText}>
            ID・合言葉がわからない人は<br />
            先生におしえてもらおう
          </p>
        </footer>
      </main>

      {/* spinner用のkeyframesをグローバル注入 */}
      <style>{`
        @keyframes burning_swordman_spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes burning_swordman_flame_left {
          0%, 100% { transform: rotate(-8deg) scale(1); }
          50%      { transform: rotate(-12deg) scale(1.08); }
        }
        @keyframes burning_swordman_flame_right {
          0%, 100% { transform: rotate(8deg) scale(1); }
          50%      { transform: rotate(12deg) scale(1.08); }
        }
        input:focus {
          outline: none;
          border-color: ${COLOR.primary} !important;
          box-shadow: 0 0 0 3px rgba(178, 34, 34, 0.18);
        }
      `}</style>
    </div>
  );
}

// =====================================================================
// スタイル定義
// =====================================================================
const styles: Record<string, React.CSSProperties> = {
  outer: {
    position:       'relative',
    minHeight:      '100vh',
    width:          '100%',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    padding:        '24px 16px',
    backgroundColor: COLOR.bg,
    overflow:       'hidden',
  },
  bgPattern: {
    position: 'absolute',
    inset:    0,
    background: `
      radial-gradient(circle at 15% 10%, ${COLOR.bgPattern} 0%, transparent 35%),
      radial-gradient(circle at 85% 90%, ${COLOR.bgPattern} 0%, transparent 35%),
      linear-gradient(180deg, ${COLOR.bg} 0%, ${COLOR.bgSoft} 100%)
    `,
    zIndex: 0,
  },
  container: {
    position:    'relative',
    zIndex:      1,
    width:       '100%',
    maxWidth:    '420px',
    backgroundColor: COLOR.bg,
    borderRadius:    '16px',
    padding:         '32px 28px 28px',
    boxShadow:       `0 8px 24px rgba(178, 34, 34, 0.12),
                      0 2px 6px rgba(0, 0, 0, 0.04)`,
    border:          `2px solid ${COLOR.primary}`,
  },

  // ヘッダー
  header: {
    textAlign:    'center',
    marginBottom: '28px',
  },
  flameRow: {
    display:        'flex',
    justifyContent: 'center',
    gap:            '12px',
    fontSize:       '32px',
    marginBottom:   '4px',
  },
  flameLeft: {
    display:   'inline-block',
    animation: 'burning_swordman_flame_left 1.6s ease-in-out infinite',
  },
  flameRight: {
    display:   'inline-block',
    animation: 'burning_swordman_flame_right 1.6s ease-in-out infinite',
  },
  title: {
    margin:       '8px 0 4px',
    fontSize:     '40px',
    fontWeight:   900,
    letterSpacing:'0.05em',
    lineHeight:   1.1,
  },
  titleAccent: {
    color:    COLOR.primaryDark,
    fontSize: '28px',
    display:  'block',
    marginBottom: '2px',
  },
  titleMain: {
    color:        COLOR.primary,
    fontSize:     '48px',
    textShadow:   `2px 2px 0 rgba(178, 34, 34, 0.15)`,
  },
  tagline: {
    margin:    '6px 0 0',
    fontSize:  '14px',
    color:     COLOR.textMuted,
    letterSpacing: '0.1em',
  },
  dividerLine: {
    margin:       '20px auto 0',
    width:        '60%',
    height:       '3px',
    background:   `linear-gradient(90deg,
                    transparent 0%,
                    ${COLOR.primary} 50%,
                    transparent 100%)`,
  },

  // フォーム
  form: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '18px',
  },
  formTitle: {
    margin:       0,
    fontSize:     '18px',
    fontWeight:   700,
    color:        COLOR.text,
    textAlign:    'center',
    paddingBottom:'8px',
    borderBottom: `1px dashed ${COLOR.border}`,
  },

  // エラー
  errorBox: {
    display:        'flex',
    alignItems:     'center',
    gap:            '8px',
    padding:        '12px 14px',
    backgroundColor: COLOR.errorBg,
    borderLeft:     `4px solid ${COLOR.error}`,
    borderRadius:   '6px',
    color:          COLOR.error,
    fontSize:       '14px',
    fontWeight:     600,
  },
  errorIcon: {
    fontSize: '18px',
  },

  // フィールド
  field: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '6px',
  },
  label: {
    fontSize:    '14px',
    fontWeight:  700,
    color:       COLOR.primaryDark,
    letterSpacing: '0.05em',
  },
  input: {
    width:           '100%',
    boxSizing:       'border-box',
    padding:         '14px 16px',
    fontSize:        '18px',
    border:          `2px solid ${COLOR.border}`,
    borderRadius:    '8px',
    backgroundColor: COLOR.bg,
    color:           COLOR.text,
    transition:      'border-color 0.15s ease, box-shadow 0.15s ease',
  },
  inputError: {
    borderColor: COLOR.error,
  },
  hint: {
    margin:   '2px 0 0',
    fontSize: '12px',
    color:    COLOR.textMuted,
  },

  // ボタン
  button: {
    marginTop:       '8px',
    width:           '100%',
    minHeight:       '56px',
    padding:         '14px',
    fontSize:        '20px',
    fontWeight:      900,
    color:           '#FFFFFF',
    background:      `linear-gradient(180deg,
                       ${COLOR.primaryLight} 0%,
                       ${COLOR.primary} 50%,
                       ${COLOR.primaryDark} 100%)`,
    border:          `2px solid ${COLOR.primaryDark}`,
    borderRadius:    '10px',
    cursor:          'pointer',
    boxShadow:       `0 4px 0 ${COLOR.primaryDark},
                      0 6px 12px rgba(178, 34, 34, 0.3)`,
    letterSpacing:   '0.1em',
    transition:      'transform 0.08s ease, box-shadow 0.08s ease',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             '10px',
  },
  buttonDisabled: {
    opacity:    0.7,
    cursor:     'not-allowed',
    background: `linear-gradient(180deg, #C99 0%, #A77 100%)`,
  },
  buttonIcon: {
    fontSize: '22px',
  },

  // スピナー
  spinner: {
    display:      'inline-block',
    width:        '18px',
    height:       '18px',
    border:       '3px solid rgba(255,255,255,0.4)',
    borderTopColor: '#FFFFFF',
    borderRadius: '50%',
    animation:    'burning_swordman_spin 0.8s linear infinite',
  },

  // フッター
  footer: {
    marginTop:    '24px',
    paddingTop:   '16px',
    borderTop:    `1px dashed ${COLOR.border}`,
    textAlign:    'center',
  },
  footerText: {
    margin:    0,
    fontSize:  '13px',
    color:     COLOR.textMuted,
    lineHeight: 1.6,
  },
};
