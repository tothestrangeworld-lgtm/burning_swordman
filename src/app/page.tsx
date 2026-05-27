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
import XpTimelineChart  from '@/components/XpTimelineChart';
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
        />

        {/* 減衰アラート（あれば） */}
        {data.decay && data.decay.applied < 0 && (
          <div style={styles.decayAlert}>
            <span style={styles.decayIcon}>⚠️</span>
            <div>
              <div style={styles.decayTitle}>修行をサボっているぞ！</div>
              <div style={styles.decayDetail}>
                {data.decay.days_absent}日サボって
                <strong style={{ color: THEME.primary, marginLeft: 4 }}>
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
          windowDays={30}
        />

        {/* 区切り */}
        <Divider label="📈 修行値のあゆみ" />

        {/* ③ XP推移 */}
        <section style={styles.chartCard}>
          <header style={styles.chartHeader}>
            <span style={styles.chartIcon}>🔥</span>
            <h3 style={styles.chartTitle}>経験値のうつりかわり</h3>
          </header>
          <XpTimelineChart xpHistory={data.xpHistory} />
          <footer style={styles.chartFooter}>
            <span style={styles.legendItem}>
              <span style={{ ...styles.legendDot, background: THEME.primary }} /> 稽古
            </span>
            <span style={styles.legendItem}>
              <span style={{ ...styles.legendDot, background: THEME.accent }} /> 先生評価
            </span>
            <span style={styles.legendItem}>
              <span style={{ ...styles.legendDot, background: '#1E7C3A' }} /> ミニゲーム
            </span>
            <span style={styles.legendItem}>
              <span style={{ ...styles.legendDot, background: '#999' }} /> サボリ減衰
            </span>
          </footer>
        </section>

        {/* 区切り */}
        <Divider label="⚔️ 心・技・体" />

        {/* ④ 三角形レーダー */}
        <SkillTriangle
          techniques={data.techniques}
          saturationPoints={500}
        />

        {/* フッター余白 */}
        <div style={{ height: 40 }} />
      </div>
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
    position:       'relative',
    minHeight:      '100vh',
    width:          '100%',
    backgroundColor: THEME.bgSoft,
    overflow:       'hidden',
  },
  bgPattern: {
    position: 'fixed',
    inset:    0,
    background: `
      radial-gradient(circle at 10% 5%, rgba(178,34,34,0.04) 0%, transparent 30%),
      radial-gradient(circle at 90% 95%, rgba(255,215,0,0.04) 0%, transparent 30%),
      linear-gradient(180deg, ${THEME.bg} 0%, ${THEME.bgSoft} 100%)
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
    backgroundColor: '#FFFFFF',
    borderRadius:   '12px',
    border:         `2px solid ${THEME.primary}`,
    boxShadow:      '0 2px 8px rgba(178,34,34,0.10)',
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
    color:      THEME.primary,
    letterSpacing: '0.05em',
  },
  logoutBtn: {
    padding:         '6px 14px',
    fontSize:        '12px',
    fontWeight:      700,
    color:           THEME.primaryDark,
    backgroundColor: '#FFFFFF',
    border:          `1.5px solid ${THEME.primary}`,
    borderRadius:    '999px',
    cursor:          'pointer',
    transition:      'all 0.15s ease',
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
    background: `linear-gradient(90deg, transparent, ${THEME.primary} 50%, transparent)`,
  },
  dividerLabel: {
    fontSize:        '12px',
    fontWeight:      900,
    color:           THEME.primaryDark,
    letterSpacing:   '0.15em',
    padding:         '4px 12px',
    backgroundColor: '#FFFFFF',
    border:          `1px solid ${THEME.primary}`,
    borderRadius:    '999px',
  },

  // 減衰アラート
  decayAlert: {
    display:        'flex',
    alignItems:     'flex-start',
    gap:            '12px',
    padding:        '12px 14px',
    backgroundColor: '#FFF8E0',
    border:         '1px solid #FFD700',
    borderLeft:     `4px solid ${THEME.primary}`,
    borderRadius:   '10px',
  },
  decayIcon: {
    fontSize: '24px',
    flexShrink: 0,
  },
  decayTitle: {
    fontSize:   '14px',
    fontWeight: 900,
    color:      THEME.primaryDark,
    marginBottom: '2px',
  },
  decayDetail: {
    fontSize: '12px',
    color:    THEME.text,
    lineHeight: 1.5,
  },

  // チャートカード
  chartCard: {
    backgroundColor: '#FFFFFF',
    borderRadius:    '16px',
    padding:         '20px 18px 14px',
    border:          `2px solid ${THEME.primary}`,
    boxShadow:       `0 4px 16px rgba(178, 34, 34, 0.10)`,
  },
  chartHeader: {
    display:    'flex',
    alignItems: 'center',
    gap:        '8px',
    marginBottom: '8px',
  },
  chartIcon: {
    fontSize: '20px',
  },
  chartTitle: {
    margin:     0,
    fontSize:   '18px',
    fontWeight: 900,
    color:      THEME.primaryDark,
  },
  chartFooter: {
    display:    'flex',
    flexWrap:   'wrap',
    gap:        '12px',
    marginTop:  '8px',
    paddingTop: '8px',
    borderTop:  `1px dashed ${THEME.border}`,
    fontSize:   '11px',
    color:      THEME.textMuted,
  },
  legendItem: {
    display:    'inline-flex',
    alignItems: 'center',
    gap:        '4px',
  },
  legendDot: {
    width:        '8px',
    height:       '8px',
    borderRadius: '50%',
  },

  // エラー
  errorBox: {
    minHeight:      '100vh',
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    justifyContent: 'center',
    padding:        '32px',
    backgroundColor: THEME.bgSoft,
    textAlign:      'center',
  },
  errorIcon: {
    fontSize: '48px',
    marginBottom: '12px',
  },
  errorTitle: {
    fontSize:   '20px',
    fontWeight: 900,
    color:      THEME.primaryDark,
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
    color:      THEME.primaryDark,
    margin:     '12px 0 16px',
  },
  skeletonSpinner: {
    display:        'inline-block',
    width:          '32px',
    height:         '32px',
    border:         `4px solid ${THEME.bgPattern}`,
    borderTopColor: THEME.primary,
    borderRadius:   '50%',
    animation:      'burning_skel_spin 0.9s linear infinite',
  },
  skeletonCard: {
    backgroundColor: '#FFFFFF',
    borderRadius:    '16px',
    padding:         '20px 18px',
    border:          `2px solid ${THEME.border}`,
  },
  skeletonBlock: {
    backgroundColor: '#F5E6E6',
    borderRadius:    '6px',
    animation:       'burning_skel_pulse 1.4s ease-in-out infinite',
  },
};
