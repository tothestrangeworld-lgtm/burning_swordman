// src/app/settings/page.tsx
// =====================================================================
// 燃えろ剣士 - 設定画面（あいことばの変更）
// 小学生でも迷わない「新しいあいことば → もういちど → 変更」の流れ
// 生徒・先生どちらもログイン中なら利用可能
// =====================================================================

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateUserPasscode } from '@/lib/api';
import { getAuthUser } from '@/lib/auth';
import { THEME } from '@/types';

export default function SettingsPage() {
  const router = useRouter();

  // -----------------------------------------------------------------
  // ログインユーザー
  // -----------------------------------------------------------------
  const [mounted, setMounted] = useState(false);
  const [userId, setUserId]   = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [userRole, setUserRole] = useState<'student' | 'teacher' | null>(null);

  useEffect(() => {
    setMounted(true);
    const me = getAuthUser();
    if (!me) {
      router.replace('/login');
      return;
    }
    setUserId(me.id);
    setUserName(me.name);
    setUserRole(me.role);
  }, [router]);

  // -----------------------------------------------------------------
  // 入力ステート
  // -----------------------------------------------------------------
  const [newPass,     setNewPass]     = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [errorMsg,    setErrorMsg]    = useState('');
  const [success,     setSuccess]     = useState(false);

  // -----------------------------------------------------------------
  // バリデーション（リアルタイム表示用）
  // -----------------------------------------------------------------
  const mismatch = useMemo(() => {
    if (!newPass || !confirmPass) return false;
    return newPass.trim() !== confirmPass.trim();
  }, [newPass, confirmPass]);

  const canSubmit = useMemo(() => {
    if (submitting) return false;
    const n = newPass.trim();
    const c = confirmPass.trim();
    if (!n || !c) return false;
    if (n !== c) return false;
    if (n.length < 1 || n.length > 20) return false;
    return true;
  }, [newPass, confirmPass, submitting]);

  // -----------------------------------------------------------------
  // 送信処理
  // -----------------------------------------------------------------
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const n = newPass.trim();
    const c = confirmPass.trim();

    // クライアント側バリデーション
    if (!n) {
      setErrorMsg('あたらしい あいことばを入力してください');
      return;
    }
    if (n.length > 20) {
      setErrorMsg('あいことばは20文字までだぞ');
      return;
    }
    if (!c) {
      setErrorMsg('もういちど あいことばを入力してください');
      return;
    }
    if (n !== c) {
      setErrorMsg('2つの あいことばが ちがうみたい…もういちど！');
      return;
    }
    if (!userId) {
      setErrorMsg('ログイン情報が見つかりません。もう一度ログインしてね');
      return;
    }

    setErrorMsg('');
    setSubmitting(true);

    try {
      await updateUserPasscode(userId, n);
      setSuccess(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'へんこうに失敗しました';
      setErrorMsg(msg);
      setSubmitting(false);
    }
  };

  // -----------------------------------------------------------------
  // ホームへ戻る
  // -----------------------------------------------------------------
  const goHome = () => {
    router.replace(userRole === 'teacher' ? '/teacher' : '/');
  };

  // ハイドレーション対策
  if (!mounted) return null;

  // -----------------------------------------------------------------
  // ビュー
  // -----------------------------------------------------------------
  return (
    <div style={styles.outer}>
      <div style={styles.bgPattern} aria-hidden="true" />

      <div style={styles.container}>
        {/* ヘッダー */}
        <header style={styles.hero}>
          <div style={styles.heroIcon}>⚙️</div>
          <h1 style={styles.heroTitle}>あいことばの 変更</h1>
          <p style={styles.heroSub}>🔑 新しい あいことばを 決めよう</p>
        </header>

        {/* メインカード */}
        {!success ? (
          <form onSubmit={handleSubmit} style={styles.card} noValidate>
            {/* ログイン中ユーザー表示 */}
            <div style={styles.userBox}>
              <span style={styles.userBoxIcon}>
                {userRole === 'teacher' ? '👤' : '⚔️'}
              </span>
              <span style={styles.userBoxText}>
                <strong style={styles.userBoxName}>{userName}</strong>
                <span style={styles.userBoxRole}>
                  {userRole === 'teacher' ? ' 師範' : ' 門下生'}
                </span>
                <span style={styles.userBoxTail}> の あいことば</span>
              </span>
            </div>

            {/* 新しいあいことば */}
            <label htmlFor="new-pass" style={styles.label}>
              🆕 新しい あいことば
            </label>
            <input
              id="new-pass"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={newPass}
              onChange={(e) => {
                setNewPass(e.target.value);
                setErrorMsg('');
              }}
              placeholder="例：1234"
              style={styles.input}
              disabled={submitting}
              maxLength={20}
              required
            />

            {/* もういちど入力 */}
            <label htmlFor="confirm-pass" style={{ ...styles.label, marginTop: 14 }}>
              🔁 もう一度 入力
            </label>
            <input
              id="confirm-pass"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={confirmPass}
              onChange={(e) => {
                setConfirmPass(e.target.value);
                setErrorMsg('');
              }}
              placeholder="もう一度 同じものを"
              style={{
                ...styles.input,
                ...(mismatch ? styles.inputError : {}),
              }}
              disabled={submitting}
              maxLength={20}
              required
            />

            {/* リアルタイム一致チェック */}
            {confirmPass.length > 0 && (
              <p style={styles.matchHint}>
                {mismatch ? (
                  <span style={{ color: '#FF8888' }}>
                    ❌ まだ 違うみたい…
                  </span>
                ) : (
                  <span style={{ color: '#7CFC9A' }}>
                    ✅ ばっちり 合ってるぞ！
                  </span>
                )}
              </p>
            )}

            {/* エラー */}
            {errorMsg && (
              <div role="alert" style={styles.errorBox}>
                ⚠️ {errorMsg}
              </div>
            )}

            {/* 送信ボタン */}
            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                ...styles.submitBtn,
                ...(!canSubmit ? styles.submitBtnDisabled : {}),
              }}
              onTouchStart={(e) => {
                if (canSubmit) e.currentTarget.style.transform = 'scale(0.97)';
              }}
              onTouchEnd={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              onMouseDown={(e) => {
                if (canSubmit) e.currentTarget.style.transform = 'scale(0.97)';
              }}
              onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              {submitting ? (
                <>
                  <span style={styles.btnSpinner} aria-hidden="true" />
                  <span>変更中…</span>
                </>
              ) : (
                <>
                  <span style={styles.btnIcon}>🔑</span>
                  <span>あいことばを 変える</span>
                  <span style={styles.btnSubIcon}>🔥</span>
                </>
              )}
            </button>

            {/* もどるボタン */}
            <button
              type="button"
              onClick={goHome}
              disabled={submitting}
              style={styles.backBtn}
            >
              ← もどる
            </button>

            <style>{`
              @keyframes burning_settings_spin {
                from { transform: rotate(0deg); }
                to   { transform: rotate(360deg); }
              }
              @keyframes burning_settings_pop {
                0%   { transform: scale(0.6); opacity: 0; }
                60%  { transform: scale(1.15); opacity: 1; }
                100% { transform: scale(1); opacity: 1; }
              }
            `}</style>
          </form>
        ) : (
          // =============================================================
          // サクセス画面
          // =============================================================
          <div style={styles.successCard}>
            <div style={styles.successEmoji}>🎉</div>
            <h2 style={styles.successTitle}>あいことばを 変更したぞ！</h2>
            <p style={styles.successText}>
              次の ログインから<br />
              新しいあいことばを つかってね 🔑
            </p>

            <div style={styles.successNote}>
              <span style={styles.successNoteIcon}>💡</span>
              <span>あいことばは 絶対に 忘れないようにね！</span>
            </div>

            <button
              type="button"
              onClick={goHome}
              style={styles.successBtn}
              onTouchStart={(e) => (e.currentTarget.style.transform = 'scale(0.97)')}
              onTouchEnd={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.97)')}
              onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              <span style={styles.btnIcon}>🏠</span>
              <span>ホームに もどる</span>
            </button>

            <style>{`
              @keyframes burning_settings_pop {
                0%   { transform: scale(0.6); opacity: 0; }
                60%  { transform: scale(1.15); opacity: 1; }
                100% { transform: scale(1); opacity: 1; }
              }
            `}</style>
          </div>
        )}

        {/* フッター */}
        <footer style={styles.footer}>
          <p style={styles.footerText}>
            🔥 燃えろ剣士 — 小学生剣士のための稽古記録
          </p>
        </footer>
      </div>
    </div>
  );
}

// =====================================================================
// スタイル
// =====================================================================
const styles: Record<string, React.CSSProperties> = {
  // === 土台 ===
  outer: {
    position:        'relative',
    minHeight:       '100vh',
    width:           '100%',
    backgroundColor: THEME.bg,
    overflow:        'hidden',
  },
  bgPattern: {
    position: 'fixed',
    inset:    0,
    background: `
      radial-gradient(circle at 15% 8%, rgba(255,68,68,0.22) 0%, transparent 38%),
      radial-gradient(circle at 85% 92%, rgba(255,215,0,0.10) 0%, transparent 35%),
      radial-gradient(circle at 50% 50%, rgba(0,0,0,0.18) 0%, transparent 70%),
      linear-gradient(180deg, ${THEME.bgSoft} 0%, ${THEME.bg} 55%, ${THEME.primaryDark} 100%)
    `,
    zIndex:        0,
    pointerEvents: 'none',
  },
  container: {
    position:      'relative',
    zIndex:        1,
    maxWidth:      '440px',
    margin:        '0 auto',
    padding:       '40px 20px 90px', // 下部はBottomNav分の余白
    display:       'flex',
    flexDirection: 'column',
    gap:           '20px',
    minHeight:     '100vh',
  },

  // === ヒーロー ===
  hero: {
    textAlign:    'center',
    marginBottom: '4px',
  },
  heroIcon: {
    fontSize:     '56px',
    lineHeight:   1,
    marginBottom: '6px',
    filter:       'drop-shadow(0 0 16px rgba(255,215,0,0.5)) drop-shadow(0 0 24px rgba(255,68,68,0.3))',
  },
  heroTitle: {
    margin:        0,
    fontSize:      '26px',
    fontWeight:    900,
    color:         '#FFD700',
    letterSpacing: '0.08em',
    textShadow:    '0 0 12px rgba(255,215,0,0.6), 2px 2px 0 rgba(178,34,34,0.5), 0 0 24px rgba(255,68,68,0.3)',
  },
  heroSub: {
    margin:        '8px 0 0',
    fontSize:      '13px',
    color:         'rgba(255,234,226,0.8)',
    fontWeight:    700,
    letterSpacing: '0.08em',
  },

  // === カード ===
  card: {
    backgroundColor: THEME.bgCard,
    borderRadius:    '20px',
    padding:         '22px 18px 24px',
    border:          `2px solid ${THEME.primary}`,
    boxShadow:       '0 8px 32px rgba(0,0,0,0.6), 0 0 24px rgba(178,34,34,0.25), inset 0 0 32px rgba(178,34,34,0.10)',
    display:         'flex',
    flexDirection:   'column',
    gap:             '8px',
  },

  // === ユーザーボックス ===
  userBox: {
    display:         'flex',
    alignItems:      'center',
    gap:             '10px',
    padding:         '12px 14px',
    marginBottom:    '8px',
    backgroundColor: 'rgba(0,0,0,0.35)',
    border:          '1px solid rgba(255,215,0,0.25)',
    borderRadius:    '12px',
    boxShadow:       'inset 0 0 12px rgba(0,0,0,0.4)',
  },
  userBoxIcon: {
    fontSize:   '28px',
    lineHeight: 1,
  },
  userBoxText: {
    fontSize: '14px',
    color:    'rgba(255,255,255,0.85)',
    fontWeight: 700,
  },
  userBoxName: {
    color:      '#FFD700',
    fontSize:   '16px',
    fontWeight: 900,
    textShadow: '0 0 6px rgba(255,215,0,0.5)',
  },
  userBoxRole: {
    color:    'rgba(255,255,255,0.7)',
    fontSize: '13px',
  },
  userBoxTail: {
    color:    'rgba(255,255,255,0.7)',
    fontSize: '13px',
  },

  // === ラベル・入力 ===
  label: {
    display:       'block',
    fontSize:      '13px',
    fontWeight:    900,
    color:         '#FFD700',
    letterSpacing: '0.05em',
    marginBottom:  '4px',
    textShadow:    '0 0 6px rgba(255,215,0,0.4)',
  },
  input: {
    width:           '100%',
    minHeight:       '52px',
    padding:         '12px 14px',
    fontSize:        '16px',
    fontFamily:      'inherit',
    color:           '#FFFFFF',
    backgroundColor: 'rgba(0,0,0,0.35)',
    border:          '2px solid rgba(255,255,255,0.2)',
    borderRadius:    '10px',
    outline:         'none',
    boxSizing:       'border-box',
    letterSpacing:   '0.2em',
    boxShadow:       'inset 0 0 12px rgba(0,0,0,0.5)',
  },
  inputError: {
    border:    '2px solid #FF5555',
    boxShadow: 'inset 0 0 12px rgba(220,20,60,0.3), 0 0 8px rgba(255,85,85,0.3)',
  },
  matchHint: {
    margin:     '6px 0 0',
    fontSize:   '12px',
    fontWeight: 900,
    minHeight:  '16px',
    letterSpacing: '0.05em',
  },

  // === エラー ===
  errorBox: {
    padding:         '10px 12px',
    backgroundColor: 'rgba(220,20,60,0.18)',
    border:          '1px solid #FF5555',
    borderRadius:    '8px',
    color:           '#FFCCCC',
    fontSize:        '13px',
    fontWeight:      900,
    marginTop:       '8px',
    textShadow:      '0 1px 2px rgba(0,0,0,0.5)',
    boxShadow:       'inset 0 0 8px rgba(220,20,60,0.20)',
  },

  // === 送信ボタン ===
  submitBtn: {
    width:           '100%',
    minHeight:       '60px',
    padding:         '14px',
    marginTop:       '14px',
    fontSize:        '18px',
    fontFamily:      'inherit',
    fontWeight:      900,
    color:           '#FFFFFF',
    background:       `linear-gradient(180deg, #D94545 0%, ${THEME.primary} 50%, ${THEME.primaryDark} 100%)`,
    border:          '2px solid #FFD700',
    borderRadius:    '12px',
    cursor:          'pointer',
    boxShadow:       `0 4px 0 ${THEME.primaryDark}, 0 6px 16px rgba(255,215,0,0.30), 0 0 24px rgba(178,34,34,0.40)`,
    letterSpacing:   '0.08em',
    transition:      'transform 0.08s ease',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             '10px',
    WebkitTapHighlightColor: 'transparent',
    textShadow:      '0 1px 2px rgba(0,0,0,0.6)',
  },
  submitBtnDisabled: {
    opacity:    0.65,
    cursor:     'not-allowed',
    background: 'linear-gradient(180deg, #5A2C2C 0%, #3A1818 100%)',
    boxShadow:  '0 4px 0 #1A0505',
    color:      'rgba(255,255,255,0.85)',
    border:     '2px solid rgba(255,255,255,0.25)',
  },
  btnIcon: {
    fontSize: '22px',
  },
  btnSubIcon: {
    fontSize: '20px',
  },
  btnSpinner: {
    display:        'inline-block',
    width:          '20px',
    height:         '20px',
    border:         '3px solid rgba(255,255,255,0.4)',
    borderTopColor: '#FFFFFF',
    borderRadius:   '50%',
    animation:      'burning_settings_spin 0.8s linear infinite',
  },

  // === もどるボタン ===
  backBtn: {
    width:           '100%',
    minHeight:       '46px',
    padding:         '10px',
    marginTop:       '10px',
    fontSize:        '14px',
    fontFamily:      'inherit',
    fontWeight:      900,
    color:           'rgba(255,255,255,0.75)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    border:          '1.5px solid rgba(255,255,255,0.2)',
    borderRadius:    '999px',
    cursor:          'pointer',
    letterSpacing:   '0.05em',
    WebkitTapHighlightColor: 'transparent',
  },

  // === サクセスカード ===
  successCard: {
    backgroundColor: THEME.bgCard,
    borderRadius:    '20px',
    padding:         '36px 22px 28px',
    border:          '2px solid #FFD700',
    boxShadow:       '0 8px 32px rgba(0,0,0,0.6), 0 0 32px rgba(255,215,0,0.30), inset 0 0 32px rgba(178,34,34,0.10)',
    display:         'flex',
    flexDirection:   'column',
    alignItems:      'center',
    textAlign:       'center',
    gap:             '12px',
    animation:       'burning_settings_pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both',
  },
  successEmoji: {
    fontSize:     '64px',
    lineHeight:   1,
    filter:       'drop-shadow(0 0 16px rgba(255,215,0,0.6))',
    animation:    'burning_settings_pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both',
  },
  successTitle: {
    margin:        0,
    fontSize:      '24px',
    fontWeight:    900,
    color:         '#FFD700',
    letterSpacing: '0.05em',
    textShadow:    '0 0 12px rgba(255,215,0,0.6), 2px 2px 0 rgba(178,34,34,0.5)',
  },
  successText: {
    margin:     0,
    fontSize:   '14px',
    color:      'rgba(255,234,226,0.9)',
    fontWeight: 700,
    lineHeight: 1.7,
  },
  successNote: {
    display:         'flex',
    alignItems:      'center',
    gap:             '8px',
    padding:         '10px 14px',
    marginTop:       '4px',
    backgroundColor: 'rgba(0,0,0,0.35)',
    border:          '1px dashed rgba(255,215,0,0.3)',
    borderRadius:    '10px',
    fontSize:        '12px',
    fontWeight:      700,
    color:           'rgba(255,255,255,0.8)',
    lineHeight:      1.5,
    textAlign:       'left',
  },
  successNoteIcon: {
    fontSize: '18px',
  },
  successBtn: {
    width:           '100%',
    minHeight:       '56px',
    padding:         '14px',
    marginTop:       '10px',
    fontSize:        '17px',
    fontFamily:      'inherit',
    fontWeight:      900,
    color:           '#FFFFFF',
    background:       `linear-gradient(180deg, #D94545 0%, ${THEME.primary} 50%, ${THEME.primaryDark} 100%)`,
    border:          '2px solid #FFD700',
    borderRadius:    '12px',
    cursor:          'pointer',
    boxShadow:       `0 4px 0 ${THEME.primaryDark}, 0 6px 16px rgba(255,215,0,0.30)`,
    letterSpacing:   '0.08em',
    transition:      'transform 0.08s ease',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             '10px',
    WebkitTapHighlightColor: 'transparent',
    textShadow:      '0 1px 2px rgba(0,0,0,0.6)',
  },

  // === フッター ===
  footer: {
    marginTop: 'auto',
    padding:   '12px 0',
    textAlign: 'center',
  },
  footerText: {
    margin:        0,
    fontSize:      '11px',
    color:         'rgba(255,234,226,0.6)',
    letterSpacing: '0.05em',
  },
};
