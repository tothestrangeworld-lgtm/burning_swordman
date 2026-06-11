// src/app/login/page.tsx
// =====================================================================
// 燃えろ剣士 - ログイン画面（熱血ダークテーマ版・タブ白飛び完全修正）
// 小学生でも迷わない「タブで役割選択 → 名前選択 → パスコード」の3ステップ
// =====================================================================

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loginUser, useUserListSWR } from '@/lib/api';
import { saveAuthUser, getAuthUser } from '@/lib/auth';
import { THEME, UserListEntry } from '@/types';

type RoleTab = 'student' | 'teacher';

export default function LoginPage() {
  const router = useRouter();

  // 既にログイン中なら即遷移
  useEffect(() => {
    const me = getAuthUser();
    if (me) {
      router.replace(me.role === 'teacher' ? '/teacher' : '/');
    }
  }, [router]);

  // -----------------------------------------------------------------
  // ユーザー一覧取得
  // -----------------------------------------------------------------
  const { data, isLoading, error: listError, mutate } = useUserListSWR();

  // -----------------------------------------------------------------
  // 入力ステート
  // -----------------------------------------------------------------
  const [roleTab,    setRoleTab]    = useState<RoleTab>('student');
  const [selectedId, setSelectedId] = useState('');
  const [passcode,   setPasscode]   = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError,setSubmitError] = useState('');

  // -----------------------------------------------------------------
  // タブごとのユーザーリスト（学年順 → 五十音順）
  // -----------------------------------------------------------------
  const filteredUsers = useMemo(() => {
    if (!data?.users) return [];
    return [...data.users]
      .filter(u => u.role === roleTab)
      .sort((a, b) => {
        if (roleTab === 'student') {
          const ga = Number(a.grade ?? 0);   // 文字列 "3" → 数値 3（未設定は 0）
          const gb = Number(b.grade ?? 0);
          if (ga !== gb) return ga - gb;
        }
        return a.name.localeCompare(b.name, 'ja');
      });
  }, [data, roleTab]);

  // タブ切替時、選択をリセット
  useEffect(() => {
    setSelectedId('');
    setSubmitError('');
  }, [roleTab]);

  // -----------------------------------------------------------------
  // ログイン処理
  // -----------------------------------------------------------------
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (!selectedId) {
      setSubmitError(roleTab === 'student' ? '名前を選んでください' : '師範を選んでください');
      return;
    }
    if (!passcode.trim()) {
      setSubmitError('あいことばを入力してください');
      return;
    }

    setSubmitError('');
    setSubmitting(true);

    try {
      const user = await loginUser(selectedId, passcode.trim());
      saveAuthUser(user);
      router.replace(user.role === 'teacher' ? '/teacher' : '/');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ログインに失敗しました';
      setSubmitError(msg);
      setSubmitting(false);
    }
  };

  // 選択中ユーザー情報
  const selectedUser: UserListEntry | undefined = useMemo(() => {
    return filteredUsers.find(u => u.id === selectedId);
  }, [filteredUsers, selectedId]);

  // -----------------------------------------------------------------
  // ビュー
  // -----------------------------------------------------------------
  return (
    <div style={styles.outer}>
      <div style={styles.bgPattern} aria-hidden="true" />

      <div style={styles.container}>
        {/* ヒーローロゴ */}
        <header style={styles.hero}>
          <div style={styles.heroFlame}>🔥</div>
          <h1 style={styles.heroTitle}>燃えろ剣士</h1>
          <p style={styles.heroSub}>道場へようこそ</p>
        </header>

        {/* ログインカード */}
        <form onSubmit={handleSubmit} style={styles.card} noValidate>
          {/* タブ切替（生徒 / 先生） */}
          <div style={styles.tabRow} role="tablist" aria-label="役割を選択">
            <RoleTabBtn
              active={roleTab === 'student'}
              onClick={() => setRoleTab('student')}
              icon="⚔️"
              label="門下生"
              sub="（生徒）"
            />
            <RoleTabBtn
              active={roleTab === 'teacher'}
              onClick={() => setRoleTab('teacher')}
              icon="👤"
              label="師範"
              sub="（先生）"
            />
          </div>

          {/* リスト読込中 */}
          {isLoading && (
            <div style={styles.loadingBox}>
              <div style={styles.spinner} aria-hidden="true" />
              <p style={styles.loadingText}>道場の名簿を読み込み中…</p>
              <style>{`
                @keyframes burning_login_spin {
                  from { transform: rotate(0deg); }
                  to   { transform: rotate(360deg); }
                }
              `}</style>
            </div>
          )}

          {/* リスト読込エラー */}
          {listError && !isLoading && (
            <div style={styles.listErrorBox}>
              <p style={styles.listErrorText}>
                ⚠️ 名簿の読込に失敗しました
              </p>
              <button
                type="button"
                onClick={() => mutate()}
                style={styles.retryBtn}
              >
                もう一度ためす
              </button>
            </div>
          )}

          {/* ユーザー選択 */}
          {!isLoading && !listError && data && (
            <>
              <label htmlFor="user-select" style={styles.label}>
                {roleTab === 'student' ? '🎯 名前をえらぼう' : '🎯 名前を選択'}
              </label>

              {filteredUsers.length === 0 ? (
                <div style={styles.emptyBox}>
                  <span style={styles.emptyIcon}>🥺</span>
                  <span style={styles.emptyText}>
                    {roleTab === 'student'
                      ? '門下生がまだ登録されていません'
                      : '師範がまだ登録されていません'}
                  </span>
                </div>
              ) : (
                <select
                  id="user-select"
                  value={selectedId}
                  onChange={(e) => {
                    setSelectedId(e.target.value);
                    setSubmitError('');
                  }}
                  style={{
                    ...styles.select,
                    color: selectedId ? '#FFFFFF' : 'rgba(255,255,255,0.5)',
                  }}
                  disabled={submitting}
                  required
                  aria-describedby="user-select-hint"
                >
                  <option value="">
                    {roleTab === 'student' ? '── 名前を選んでね ──' : '── 名前を選択 ──'}
                  </option>
                  {roleTab === 'student'
                    ? renderStudentOptions(filteredUsers)
                    : renderTeacherOptions(filteredUsers)
                  }
                </select>
              )}

<p id="user-select-hint" style={styles.hint}>
                {filteredUsers.length > 0 && (
                  <>
                    全 <strong style={{ color: '#FFD700' }}>{filteredUsers.length}</strong>名
                    {selectedUser && (
                      <span style={styles.selectedPreview}>
                        　→ <strong style={{
                          color: '#FFD700',
                          textShadow: '0 0 6px rgba(255,215,0,0.6)',
                        }}>
                          {selectedUser.name}
                        </strong>
                        {Number(selectedUser.grade ?? 0) > 0 && (
                          <span style={{ color: 'rgba(255,255,255,0.7)' }}>
                            {` (${selectedUser.grade}年生)`}
                          </span>
                        )}
                      </span>
                    )}
                  </>
                )}
              </p>

              {/* パスコード */}
              <label htmlFor="passcode" style={{ ...styles.label, marginTop: 14 }}>
                🔑 あいことば
              </label>
              <input
                id="passcode"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                value={passcode}
                onChange={(e) => {
                  setPasscode(e.target.value);
                  setSubmitError('');
                }}
                placeholder="例：1234"
                style={styles.input}
                disabled={submitting}
                maxLength={20}
                required
              />

              {/* エラー */}
              {submitError && (
                <div role="alert" style={styles.errorBox}>
                  ⚠️ {submitError}
                </div>
              )}

              {/* 送信ボタン */}
              <button
                type="submit"
                disabled={submitting || !selectedId || !passcode}
                style={{
                  ...styles.submitBtn,
                  ...(submitting || !selectedId || !passcode ? styles.submitBtnDisabled : {}),
                }}
                onTouchStart={(e) => {
                  if (!submitting && selectedId && passcode) {
                    e.currentTarget.style.transform = 'scale(0.97)';
                  }
                }}
                onTouchEnd={(e) => e.currentTarget.style.transform = 'scale(1)'}
                onMouseDown={(e) => {
                  if (!submitting && selectedId && passcode) {
                    e.currentTarget.style.transform = 'scale(0.97)';
                  }
                }}
                onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                {submitting ? (
                  <>
                    <span style={styles.btnSpinner} aria-hidden="true" />
                    <span>入門中…</span>
                  </>
                ) : (
                  <>
                    <span style={styles.btnIcon}>⚔️</span>
                    <span>道場に入る</span>
                    <span style={styles.btnSubIcon}>🔥</span>
                  </>
                )}
              </button>
            </>
          )}
        </form>

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
// 生徒の選択肢：学年ごとにグループ化
// =====================================================================
function renderStudentOptions(users: UserListEntry[]): React.ReactNode {
  const byGrade = users.reduce<Record<number, UserListEntry[]>>((acc, u) => {
    const g = Number(u.grade ?? 0);
    (acc[g] = acc[g] || []).push(u);
    return acc;
  }, {});

  const grades = Object.keys(byGrade).map(Number).sort((a, b) => a - b);

  return grades.map(g => (
    <optgroup
      key={g}
      label={g > 0 ? `${g}年生` : 'その他'}
      style={{
        backgroundColor: '#1A0505',
        color: '#FFD700',
        fontWeight: 900,
      }}
    >
      {byGrade[g].map(u => (
        <option key={u.id} value={u.id} style={optionStyle}>
          {u.name}
        </option>
      ))}
    </optgroup>
  ));
}

// =====================================================================
// 先生の選択肢：シンプル一覧
// =====================================================================
function renderTeacherOptions(users: UserListEntry[]): React.ReactNode {
  return users.map(u => (
    <option key={u.id} value={u.id} style={optionStyle}>
      {u.name} 先生
    </option>
  ));
}

// option の共通スタイル（ダーク背景に白文字）
const optionStyle: React.CSSProperties = {
  backgroundColor: '#2D0B0B',
  color:           '#FFFFFF',
};

// =====================================================================
// 役割タブボタン
// =====================================================================
function RoleTabBtn({
  active, onClick, icon, label, sub,
}: {
  active:  boolean;
  onClick: () => void;
  icon:    string;
  label:   string;
  sub:     string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        ...styles.tabBtn,
        ...(active ? styles.tabBtnActive : {}),
      }}
      onTouchStart={(e) => {
        if (!active) e.currentTarget.style.transform = 'scale(0.96)';
      }}
      onTouchEnd={(e) => e.currentTarget.style.transform = 'scale(1)'}
      onMouseDown={(e) => {
        if (!active) e.currentTarget.style.transform = 'scale(0.96)';
      }}
      onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
      onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
    >
      <span style={styles.tabIcon}>{icon}</span>
      <span style={styles.tabLabel}>{label}</span>
      <span style={styles.tabSub}>{sub}</span>
    </button>
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
    padding:       '40px 20px 24px',
    display:       'flex',
    flexDirection: 'column',
    gap:           '20px',
    minHeight:     '100vh',
  },

  // === ヒーローロゴ ===
  hero: {
    textAlign:    'center',
    marginBottom: '8px',
  },
  heroFlame: {
    fontSize:     '64px',
    lineHeight:   1,
    marginBottom: '4px',
    filter:       'drop-shadow(0 0 16px rgba(255,68,68,0.7)) drop-shadow(0 0 24px rgba(255,215,0,0.4))',
  },
  heroTitle: {
    margin:        0,
    fontSize:      '34px',
    fontWeight:    900,
    color:         '#FFD700',
    letterSpacing: '0.12em',
    textShadow:    '0 0 12px rgba(255,215,0,0.6), 2px 2px 0 rgba(178,34,34,0.5), 0 0 24px rgba(255,68,68,0.3)',
  },
  heroSub: {
    margin:    '6px 0 0',
    fontSize:  '13px',
    color:     'rgba(255,234,226,0.8)',
    fontWeight: 700,
    letterSpacing: '0.15em',
  },

  // === カード ===
  card: {
    backgroundColor: THEME.bgCard,
    borderRadius:    '20px',
    padding:         '20px 18px 24px',
    border:          `2px solid ${THEME.primary}`,
    boxShadow:       '0 8px 32px rgba(0,0,0,0.6), 0 0 24px rgba(178,34,34,0.25), inset 0 0 32px rgba(178,34,34,0.10)',
    display:         'flex',
    flexDirection:   'column',
    gap:             '12px',
  },

  // === タブ ===
  tabRow: {
    display:        'grid',
    gridTemplateColumns: '1fr 1fr',
    gap:            '8px',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding:         '6px',
    borderRadius:    '12px',
    marginBottom:    '4px',
    border:          '1px solid rgba(255,255,255,0.15)',
    boxShadow:       'inset 0 0 16px rgba(0,0,0,0.6)',
  },
  // ★★★ 修正箇所 ★★★
  // backgroundColor を削除し、background ショートハンドに統一
  // tabBtnActive も `background` を使っているため、プロパティ階層を一致させる
  // backgroundImage: 'none' を明示してアクティブ時のグラデーションを確実にリセット
  tabBtn: {
    minHeight:       '64px',
    padding:         '8px 4px',
    fontFamily:      'inherit',
    color:           '#FFEAE2',
    background:      '#1A0505',           // ★ ショートハンドに変更
    backgroundImage: 'none',              // ★ グラデーション残留を完全防止
    border:          '2px solid rgba(255,255,255,0.12)',
    borderRadius:    '10px',
    cursor:          'pointer',
    transition:      'all 0.2s ease',
    display:         'flex',
    flexDirection:   'column',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             '2px',
    WebkitTapHighlightColor: 'transparent',
    WebkitAppearance: 'none',
    appearance:       'none' as React.CSSProperties['appearance'],
  },
  tabBtnActive: {
    color:           '#FFFFFF',
    background:      `linear-gradient(180deg, ${THEME.primary} 0%, ${THEME.primaryDark} 100%)`,
    borderColor:     '#FFD700',
    boxShadow:       `0 4px 0 ${THEME.primaryDark}, 0 0 16px rgba(255,215,0,0.45)`,
    textShadow:      '0 1px 2px rgba(0,0,0,0.6)',
  },
  tabIcon: {
    fontSize:   '26px',
    lineHeight: 1,
  },
  tabLabel: {
    fontSize:      '15px',
    fontWeight:    900,
    letterSpacing: '0.05em',
  },
  tabSub: {
    fontSize:   '10px',
    fontWeight: 700,
    opacity:    0.85,
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
  select: {
    width:           '100%',
    minHeight:       '52px',
    padding:         '12px 14px',
    fontSize:        '16px',
    fontFamily:      'inherit',
    fontWeight:      700,
    backgroundColor: 'rgba(0,0,0,0.35)',
    border:          '2px solid rgba(255,255,255,0.2)',
    borderRadius:    '10px',
    outline:         'none',
    appearance:      'none',
    WebkitAppearance:'none',
    backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8' fill='%23FFFFFF'%3E%3Cpath d='M6 8L0 0h12z'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 14px center',
    backgroundSize:  '12px 8px',
    paddingRight:    '40px',
    boxSizing:       'border-box',
    cursor:          'pointer',
    boxShadow:       'inset 0 0 12px rgba(0,0,0,0.5)',
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
  hint: {
    margin:    '6px 0 0',
    fontSize:  '11px',
    color:     'rgba(255,255,255,0.65)',
    minHeight: '16px',
  },
  selectedPreview: {
    marginLeft: '6px',
  },

  // === ローディング ===
  loadingBox: {
    padding:        '24px',
    textAlign:      'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius:   '10px',
    border:         '1px dashed rgba(255,255,255,0.2)',
    boxShadow:      'inset 0 0 16px rgba(0,0,0,0.5)',
  },
  spinner: {
    display:        'inline-block',
    width:          '32px',
    height:         '32px',
    border:         '4px solid rgba(255,255,255,0.15)',
    borderTopColor: '#FFD700',
    borderRadius:   '50%',
    animation:      'burning_login_spin 0.8s linear infinite',
    marginBottom:   '8px',
    boxShadow:      '0 0 12px rgba(255,215,0,0.4)',
  },
  loadingText: {
    margin:    0,
    fontSize:  '13px',
    fontWeight: 900,
    color:     '#FFD700',
    textShadow: '0 0 6px rgba(255,215,0,0.5)',
    letterSpacing: '0.1em',
  },

  // === リストエラー ===
  listErrorBox: {
    padding:         '16px',
    backgroundColor: 'rgba(220,20,60,0.18)',
    border:          '1px solid #FF5555',
    borderRadius:    '10px',
    textAlign:       'center',
    boxShadow:       'inset 0 0 12px rgba(220,20,60,0.20)',
  },
  listErrorText: {
    margin:     '0 0 10px',
    fontSize:   '13px',
    fontWeight: 900,
    color:      '#FFCCCC',
    textShadow: '0 1px 2px rgba(0,0,0,0.5)',
  },
  retryBtn: {
    padding:      '8px 20px',
    fontSize:     '13px',
    fontWeight:   900,
    color:        '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.05)',
    border:       `1.5px solid ${THEME.primary}`,
    borderRadius: '999px',
    cursor:       'pointer',
    letterSpacing: '0.05em',
  },

  // === 空状態 ===
  emptyBox: {
    padding:         '20px',
    backgroundColor: 'rgba(0,0,0,0.35)',
    border:          '1px dashed rgba(255,255,255,0.2)',
    borderRadius:    '10px',
    textAlign:       'center',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             '8px',
    boxShadow:       'inset 0 0 12px rgba(0,0,0,0.5)',
  },
  emptyIcon: {
    fontSize: '24px',
  },
  emptyText: {
    fontSize:   '13px',
    color:      'rgba(255,255,255,0.65)',
    fontWeight: 700,
  },

  // === 入力エラー ===
  errorBox: {
    padding:         '10px 12px',
    backgroundColor: 'rgba(220,20,60,0.18)',
    border:          '1px solid #FF5555',
    borderRadius:    '8px',
    color:           '#FFCCCC',
    fontSize:        '13px',
    fontWeight:      900,
    marginTop:       '4px',
    textShadow:      '0 1px 2px rgba(0,0,0,0.5)',
    boxShadow:       'inset 0 0 8px rgba(220,20,60,0.20)',
  },

  // === 送信ボタン ===
  submitBtn: {
    width:           '100%',
    minHeight:       '60px',
    padding:         '14px',
    marginTop:       '8px',
    fontSize:        '18px',
    fontFamily:      'inherit',
    fontWeight:      900,
    color:           '#FFFFFF',
    background:      `linear-gradient(180deg, #D94545 0%, ${THEME.primary} 50%, ${THEME.primaryDark} 100%)`,
    border:          '2px solid #FFD700',
    borderRadius:    '12px',
    cursor:          'pointer',
    boxShadow:       `0 4px 0 ${THEME.primaryDark}, 0 6px 16px rgba(255,215,0,0.30), 0 0 24px rgba(178,34,34,0.40)`,
    letterSpacing:   '0.1em',
    transition:      'transform 0.08s ease',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             '12px',
    WebkitTapHighlightColor: 'transparent',
    textShadow:      '0 1px 2px rgba(0,0,0,0.6)',
  },
  submitBtnDisabled: {
    opacity:    0.65,
    cursor:     'not-allowed',
    background: `linear-gradient(180deg, #5A2C2C 0%, #3A1818 100%)`,
    boxShadow:  '0 4px 0 #1A0505',
    color:      'rgba(255,255,255,0.85)',
    border:     '2px solid rgba(255,255,255,0.25)',
  },
  btnIcon: {
    fontSize: '24px',
  },
  btnSubIcon: {
    fontSize: '22px',
  },
  btnSpinner: {
    display:        'inline-block',
    width:          '20px',
    height:         '20px',
    border:         '3px solid rgba(255,255,255,0.4)',
    borderTopColor: '#FFFFFF',
    borderRadius:   '50%',
    animation:      'burning_login_spin 0.8s linear infinite',
  },

  // === フッター ===
  footer: {
    marginTop:  'auto',
    padding:    '12px 0',
    textAlign:  'center',
  },
  footerText: {
    margin:   0,
    fontSize: '11px',
    color:    'rgba(255,234,226,0.6)',
    letterSpacing: '0.05em',
  },
};
