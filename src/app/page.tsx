// src/app/page.tsx
// =====================================================================
// 燃えよ剣士 - 生徒ダッシュボード（ホーム画面）
// ログインした生徒が朝イチで開いて「うおおぉ俺つえぇ！」となる画面
// =====================================================================

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMyDashboardSWR } from '@/lib/api';
import { getAuthUser, clearAuthUser } from '@/lib/auth';
import { THEME } from '@/types';

import StatusCard       from '@/components/StatusCard';
import TaskReportCard   from '@/components/TaskReportCard';
import SkillTriangle    from '@/components/SkillTriangle';

export default function StudentDashboardPage() {
  const router = useRouter();

  // ---------------------------------------------------------------
  // 認証ガード
  // ---------------------------------------------------------------
  useEffect(() => {
    const user = getAuthUser();
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.role === 'teacher') {
      router.replace('/teacher');
      return;
    }
  }, [router]);

  const user = typeof window !== 'undefined' ? getAuthUser() : null;

  // ---------------------------------------------------------------
  // データ取得
  // ---------------------------------------------------------------
  const { data, error, isLoading, mutate } = useMyDashboardSWR();

  // ---------------------------------------------------------------
  // ローディング：ヒロイックスケルトン
  // ---------------------------------------------------------------
  if (!user || isLoading) {
    return <DashboardSkeleton />;
  }

  // ---------------------------------------------------------------
  // エラー
  // ---------------------------------------------------------------
  if (error || !data) {
    return (
      <div style={styles.errorBox}>
        <div style={styles.errorIcon}>😣</div>
        <h2 style={styles.errorTitle}>道場に繋がらないよ…</h2>
        <p style={styles.errorMessage}>
          {error instanceof Error ? error.message : 'データの読み込みに失敗しました'}
        </p>
        <button
          style={styles.retryButton}
          onClick={() => mutate()}
        >
          もう一度ためす
        </button>
      </div>
    );
  }

  // ---------------------------------------------------------------
  // ログアウト
  // ---------------------------------------------------------------
  const handleLogout = () => {
    if (confirm('道場を出るかい？')) {
      clearAuthUser();
      router.replace('/login');
    }
  };

  // ---------------------------------------------------------------
  // 記録画面へ遷移
  // ---------------------------------------------------------------
  const handleGoRecord = () => {
    router.push('/record');
  };

  // ---------------------------------------------------------------
  // メインビュー
  // ---------------------------------------------------------------
  return (
    <div style={styles.outer}>
      {/* 背景パターン */}
      <div style={styles.bgPattern} aria-hidden="true" />

      <div style={styles.container}>
        {/* ヘッダーバー */}
        <header style={styles.headerBar}>
          <div style={styles.headerLeft}>
            <span style={styles.headerLogo}>🔥</span>
            <span style={styles.headerTitle}>燃えよ剣士</span>
          </div>
          <button
            onClick={handleLogout}
            style={styles.logoutBtn}
            aria-label="ログアウト"
          >
            退場
          </button>
        </header>

        {/* ① ステータスカード */}
        <StatusCard
          userName={data.user.name}
          status={data.status}
          titleMaster={data.titleMaster}
          xpHistory={data.xpHistory}
        />

        {/* ★ 記録CTA（メインアクション） */}
        <button
          onClick={handleGoRecord}
          style={styles.recordCta}
          onTouchStart={(e) => e.currentTarget.style.transform = 'scale(0.97)'}
          onTouchEnd={(e) => e.currentTarget.style.transform = 'scale(1)'}
          onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.97)'}
          onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
          aria-label="今日の修行を記録する"
        >
          <span style={styles.recordCtaIcon}>📝</span>
          <span style={styles.recordCtaText}>
            <span style={styles.recordCtaMain}>今日の修行を記録する</span>
            <span style={styles.recordCtaSub}>稽古をきろくして経験値ゲット！</span>
          </span>
          <span style={styles.recordCtaFlame}>🔥</span>
        </button>

        {/* 減衰アラート（あれば） */}
        {data.decay && data.decay.applied < 0 && (
          <div style={styles.decayAlert}>
            <span style={styles.decayIcon}>⚠️</span>
            <div>
              <div style={styles.decayTitle}>修行をサボっているぞ！</div>
              <div style={styles.decayDetail}>
                {data.decay.days_absent}日サボって
                <strong style={{ color: THEME.accent, marginLeft: 4 }}>
                  {data.decay.applied} XP
                </strong>
                修行値が減ってしまった…
              </div>
            </div>
          </div>
        )}

        {/* 区切り */}
        <Divider label="📜 修行のきろく" />

        {/* ② 通知表 */}
        <TaskReportCard
          taskMaster={data.taskMaster}
          taskLogs={data.taskLogs}
          teacherEvals={data.teacherEvals ?? []}
          windowDays={30}
        />

        <Divider label="⚔️ 技の修得" />

        {/* ④ 三角形レーダー */}
        <SkillTriangle
          techniques={data.techniques}
          saturationPoints={500}
        />

        {/* 下部にもう一度CTAを配置（スクロールしてきた剣士向け） */}
        <button
          onClick={handleGoRecord}
          style={styles.recordCtaBottom}
          onTouchStart={(e) => e.currentTarget.style.transform = 'scale(0.97)'}
          onTouchEnd={(e) => e.currentTarget.style.transform = 'scale(1)'}
          onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.97)'}
          onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          <span style={{ fontSize: '20px' }}>⚔️</span>
          <span>修行をきろくする</span>
          <span style={{ fontSize: '18px' }}>🔥</span>
        </button>

        {/* フッター余白 */}
        <div style={{ height: 40 }} />
      </div>

      <style>{`
        @keyframes burning_cta_glow {
          0%, 100% {
            box-shadow:
              0 4px 0 ${THEME.primaryDark},
              0 6px 16px rgba(178,34,34,0.35),
              0 0 0 0 rgba(255,215,0,0);
          }
          50% {
            box-shadow:
              0 4px 0 ${THEME.primaryDark},
              0 6px 16px rgba(178,34,34,0.45),
              0 0 0 4px rgba(255,215,0,0.25);
          }
        }
      `}</style>
    </div>
  );
}

// =====================================================================
// 区切り線
// =====================================================================
function Divider({ label }: { label: string }) {
  return (
    <div style={styles.divider}>
      <div style={styles.dividerLine} />
      <span style={styles.dividerLabel}>{label}</span>
      <div style={styles.dividerLine} />
    </div>
  );
}

// =====================================================================
// スケルトンUI（ヒロイックローディング）
// =====================================================================
function DashboardSkeleton() {
  return (
    <div style={styles.outer}>
      <div style={styles.bgPattern} aria-hidden="true" />
      <div style={styles.container}>
        {/* ロゴ */}
        <div style={styles.skeletonLogo}>
          <div style={styles.skeletonFlame}>🔥</div>
          <h2 style={styles.skeletonTitle}>修行のきろくを呼び出し中…</h2>
          <div style={styles.skeletonSpinner} />
        </div>

        {/* ステータスカード骨格 */}
        <div style={styles.skeletonCard}>
          <div style={{ ...styles.skeletonBlock, width: '40%', height: 18, marginBottom: 12 }} />
          <div style={{ ...styles.skeletonBlock, width: '70%', height: 28, marginBottom: 16 }} />
          <div style={{ ...styles.skeletonBlock, width: '100%', height: 50, marginBottom: 12 }} />
          <div style={{ ...styles.skeletonBlock, width: '100%', height: 18 }} />
        </div>

        {/* 他のカード骨格 */}
        {[1, 2, 3].map(i => (
          <div key={i} style={styles.skeletonCard}>
            <div style={{ ...styles.skeletonBlock, width: '50%', height: 20, marginBottom: 12 }} />
            <div style={{ ...styles.skeletonBlock, width: '100%', height: 80 }} />
          </div>
        ))}
      </div>

      <style>{`
        @keyframes burning_skel_pulse {
          0%, 100% { opacity: 0.5; }
          50%      { opacity: 1; }
        }
        @keyframes burning_skel_flame {
          0%, 100% { transform: scale(1) rotate(-3deg); }
          50%      { transform: scale(1.1) rotate(3deg); }
        }
        @keyframes burning_skel_spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// =====================================================================
// スタイル
// =====================================================================
const styles: Record<string, React.CSSProperties> = {
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
    position:    'relative',
    zIndex:      1,
    maxWidth:    '720px',
    margin:      '0 auto',
    padding:     '12px 14px 0',
    display:     'flex',
    flexDirection:'column',
    gap:         '14px',
  },

  // ヘッダーバー
  headerBar: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'center',
    padding:        '10px 12px',
    backgroundColor: THEME.bgCard,
    borderRadius:   '12px',
    border:         `2px solid ${THEME.borderSolid}`,
    boxShadow:      '0 4px 16px rgba(0,0,0,0.35)',
  },
  headerLeft: {
    display:    'flex',
    alignItems: 'center',
    gap:        '6px',
  },
  headerLogo: {
    fontSize: '22px',
  },
  headerTitle: {
    fontSize:   '17px',
    fontWeight: 900,
    color:      THEME.text,
    letterSpacing: '0.05em',
  },
  logoutBtn: {
    padding:         '6px 14px',
    fontSize:        '12px',
    fontWeight:      700,
    color:           THEME.text,
    backgroundColor: 'transparent',
    border:          `1.5px solid ${THEME.borderSolid}`,
    borderRadius:    '999px',
    cursor:          'pointer',
    transition:      'all 0.15s ease',
  },

  // ★ 記録CTA（トップ・大型）
  recordCta: {
    width:           '100%',
    minHeight:       '72px',
    padding:         '14px 18px',
    fontFamily:      'inherit',
    fontSize:        '17px',
    fontWeight:      900,
    color:           '#FFFFFF',
    background:      `linear-gradient(180deg, #FF5555 0%, ${THEME.primary} 45%, ${THEME.primaryDark} 100%)`,
    border:          `2px solid ${THEME.borderSolid}`,
    borderRadius:    '14px',
    cursor:          'pointer',
    letterSpacing:   '0.05em',
    transition:      'transform 0.08s ease',
    display:         'flex',
    alignItems:      'center',
    gap:             '14px',
    animation:       'burning_cta_glow 2.4s ease-in-out infinite',
    WebkitTapHighlightColor: 'transparent',
    boxShadow:       '0 4px 20px rgba(255,68,68,0.45)',
  },
  recordCtaIcon: {
    fontSize:    '32px',
    flexShrink:  0,
  },
  recordCtaText: {
    flex:           1,
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'flex-start',
    gap:            '2px',
  },
  recordCtaMain: {
    fontSize:   '17px',
    fontWeight: 900,
  },
  recordCtaSub: {
    fontSize:   '11px',
    fontWeight: 600,
    opacity:    0.85,
    color:      THEME.textMuted,
    letterSpacing: '0.05em',
  },
  recordCtaFlame: {
    fontSize:   '24px',
    flexShrink: 0,
  },

  // 下部の控えめCTA
  recordCtaBottom: {
    width:           '100%',
    minHeight:       '54px',
    padding:         '14px',
    fontFamily:      'inherit',
    fontSize:        '16px',
    fontWeight:      900,
    color:           '#FFFFFF',
    background:      `linear-gradient(180deg, ${THEME.primary} 0%, ${THEME.primaryDark} 100%)`,
    border:          `2px solid ${THEME.borderSolid}`,
    borderRadius:    '12px',
    cursor:          'pointer',
    letterSpacing:   '0.1em',
    transition:      'transform 0.08s ease',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             '10px',
    boxShadow:       '0 4px 16px rgba(0,0,0,0.4)',
    marginTop:       '8px',
    WebkitTapHighlightColor: 'transparent',
  },

  // 区切り
  divider: {
    display:    'flex',
    alignItems: 'center',
    gap:        '10px',
    marginTop:  '8px',
    marginBottom: '-4px',
  },
  dividerLine: {
    flex:      1,
    height:    '2px',
    background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.55) 50%, transparent)`,
  },
  dividerLabel: {
    fontSize:        '12px',
    fontWeight:      900,
    color:           THEME.text,
    letterSpacing:   '0.15em',
    padding:         '4px 12px',
    backgroundColor: THEME.bgCard,
    border:          `1px solid ${THEME.borderSolid}`,
    borderRadius:    '999px',
  },

  decayAlert: {
    display:        'flex',
    alignItems:     'flex-start',
    gap:            '12px',
    padding:        '12px 14px',
    backgroundColor: THEME.bgCardDeep,
    border:         `1px solid ${THEME.accent}`,
    borderLeft:     `4px solid ${THEME.accent}`,
    borderRadius:   '10px',
  },
  decayIcon: {
    fontSize: '24px',
    flexShrink: 0,
  },
  decayTitle: {
    fontSize:   '14px',
    fontWeight: 900,
    color:      THEME.text,
    marginBottom: '2px',
  },
  decayDetail: {
    fontSize: '12px',
    color:    THEME.textMuted,
    lineHeight: 1.5,
  },

  // エラー
  errorBox: {
    minHeight:      '100vh',
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    justifyContent: 'center',
    padding:        '32px',
    backgroundColor: THEME.bg,
    textAlign:      'center',
  },
  errorIcon: {
    fontSize: '48px',
    marginBottom: '12px',
  },
  errorTitle: {
    fontSize:   '20px',
    fontWeight: 900,
    color:      THEME.text,
    margin:     '0 0 8px',
  },
  errorMessage: {
    fontSize: '14px',
    color:    THEME.textMuted,
    margin:   '0 0 20px',
  },
  retryButton: {
    padding:         '12px 28px',
    fontSize:        '15px',
    fontWeight:      900,
    color:           '#FFFFFF',
    background:      `linear-gradient(180deg, ${THEME.primary} 0%, ${THEME.primaryDark} 100%)`,
    border:          'none',
    borderRadius:    '8px',
    cursor:          'pointer',
    boxShadow:       `0 4px 0 ${THEME.primaryDark}`,
  },

  // スケルトン
  skeletonLogo: {
    textAlign: 'center',
    padding:   '40px 20px 20px',
  },
  skeletonFlame: {
    fontSize:  '48px',
    animation: 'burning_skel_flame 1.4s ease-in-out infinite',
  },
  skeletonTitle: {
    fontSize:   '15px',
    fontWeight: 700,
    color:      THEME.textMuted,
    margin:     '12px 0 16px',
  },
  skeletonSpinner: {
    display:        'inline-block',
    width:          '32px',
    height:         '32px',
    border:         `4px solid rgba(255,255,255,0.15)`,
    borderTopColor: THEME.accent,
    borderRadius:   '50%',
    animation:      'burning_skel_spin 0.9s linear infinite',
  },
  skeletonCard: {
    backgroundColor: THEME.bgCard,
    borderRadius:    '16px',
    padding:         '20px 18px',
    border:          `2px solid ${THEME.borderSolid}`,
  },
  skeletonBlock: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius:    '6px',
    animation:       'burning_skel_pulse 1.4s ease-in-out infinite',
  },
};
