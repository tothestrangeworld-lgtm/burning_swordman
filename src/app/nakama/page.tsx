// src/app/nakama/page.tsx
// =====================================================================
// 燃えろ剣士 - なかま（門下生・切磋琢磨マップ）画面
// 他の門下生の頑張りを散布図で可視化し、切磋琢磨のモチベーションを高め合う
// Phase 8:   新規実装
// Phase 8.1: 散布図（2軸グラフ）ビュー追加
// Phase 8.2: UI/UXリファクタリング（リスト廃止・インラインポップアップ・青/金配色）
// Phase 8.3: ズーム＆頭文字ラベル対応
// Phase 8.4: NakamaGraph コンポーネントへグラフ描画を切り出し（先生画面と共有）
// =====================================================================

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useNakamaListSWR,
  cheerStudent,
  type NakamaEntry,
} from '@/lib/api';
import { getAuthUser } from '@/lib/auth';
import { THEME } from '@/types';
import NakamaGraph, { type NakamaGraphEntry } from '@/components/NakamaGraph';

const SELF_COLOR = '#FFD700';

function toGraphEntry(entry: NakamaEntry): NakamaGraphEntry {
  return {
    user_id:               entry.user_id,
    name:                  entry.name,
    grade:                 entry.grade,
    level:                 entry.level,
    total_xp:              entry.total_xp,
    title:                 entry.title,
    last_practice_date:    entry.last_practice_date,
    daysSinceLastPractice: entry.daysSinceLastPractice,
    total_practice_days:   entry.total_practice_days,
    isBurning:             entry.isBurning,
    cheeredTodayByMe:      entry.cheeredTodayByMe,
  };
}

export default function NakamaPage() {
  const router = useRouter();

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

  const { data, error, isLoading, mutate } = useNakamaListSWR();

  const [cheeringId, setCheeringId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  const handleCheer = async (entry: NakamaGraphEntry) => {
    if (cheeringId) return;
    if (entry.cheeredTodayByMe) return;

    setCheeringId(entry.user_id);
    try {
      const res = await cheerStudent(entry.user_id);
      setToast({ text: res.message, ok: res.cheered });
      await mutate();
    } catch (e) {
      setToast({
        text: e instanceof Error ? e.message : '応援に失敗しました…',
        ok:   false,
      });
    } finally {
      setCheeringId(null);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const graphEntries = useMemo((): NakamaGraphEntry[] => {
    if (!data) return [];
    const list = data.nakama.map(toGraphEntry);
    if (data.my_data) {
      list.push(toGraphEntry(data.my_data));
    }
    return list;
  }, [data]);

  if (!user || isLoading) {
    return <NakamaSkeleton />;
  }

  if (error || !data) {
    return (
      <div style={styles.errorBox}>
        <div style={styles.errorIcon}>😣</div>
        <h2 style={styles.errorTitle}>なかまが集まらないよ…</h2>
        <p style={styles.errorMessage}>
          {error instanceof Error ? error.message : 'データの読み込みに失敗しました'}
        </p>
        <button style={styles.retryButton} onClick={() => mutate()}>
          もう一度ためす
        </button>
      </div>
    );
  }

  const { cheeredToday } = data;

  return (
    <div style={styles.outer}>
      <div style={styles.bgPattern} aria-hidden="true" />

      <div style={styles.container}>
        <header style={styles.headerBar}>
          <div style={styles.headerLeft}>
            <span style={styles.headerLogo}>🔥</span>
            <span style={styles.headerTitle}>なかまの修行マップ</span>
          </div>
          <div style={styles.cheerCountBadge}>
            今日の応援 <strong style={{ color: THEME.accent }}>{cheeredToday}</strong> 人
          </div>
        </header>

        <div style={styles.infoBanner}>
          <span style={{ fontSize: '22px' }}>🎌</span>
          <div>
            <div style={styles.infoTitle}>なかまと切磋琢磨しよう！</div>
            <div style={styles.infoSub}>
              ＋/−で拡大して、ドットをタップ！
              <strong style={{ color: SELF_COLOR }}> 金色</strong>のドットが「キミ」だ🔥
            </div>
          </div>
        </div>

        <NakamaGraph
          entries={graphEntries}
          selfUserId={data.my_data?.user_id ?? user.id}
          onCheer={handleCheer}
          cheeringId={cheeringId}
        />

        <div style={{ height: 80 }} />
      </div>

      {toast && (
        <div
          style={{
            ...styles.toast,
            backgroundColor: toast.ok ? THEME.primaryDark : THEME.bgCardDeep,
            borderColor:     toast.ok ? THEME.accent : THEME.border,
          }}
          role="status"
        >
          <span style={{ fontSize: '18px' }}>{toast.ok ? '🔥' : '😅'}</span>
          <span>{toast.text}</span>
        </div>
      )}

      <style>{`
        @keyframes nakama_toast_in {
          0%   { transform: translate(-50%, 20px); opacity: 0; }
          100% { transform: translate(-50%, 0);    opacity: 1; }
        }
        @keyframes nakama_skel_pulse {
          0%, 100% { opacity: 0.5; }
          50%      { opacity: 1; }
        }
        @keyframes nakama_skel_flame {
          0%, 100% { transform: scale(1) rotate(-3deg); }
          50%      { transform: scale(1.1) rotate(3deg); }
        }
        @keyframes nakama_skel_spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function NakamaSkeleton() {
  return (
    <div style={styles.outer}>
      <div style={styles.bgPattern} aria-hidden="true" />
      <div style={styles.container}>
        <div style={styles.skeletonLogo}>
          <div style={styles.skeletonFlame}>🔥</div>
          <h2 style={styles.skeletonTitle}>なかまを呼び出し中…</h2>
          <div style={styles.skeletonSpinner} />
        </div>

        <div style={styles.skeletonGraph}>
          <div style={{ ...styles.skeletonBlock, width: '100%', height: '100%', borderRadius: 14 }} />
        </div>
      </div>
    </div>
  );
}

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
    position:      'relative',
    zIndex:        1,
    maxWidth:      '720px',
    margin:        '0 auto',
    padding:       '12px 14px 0',
    display:       'flex',
    flexDirection: 'column',
    gap:           '12px',
  },
  headerBar: {
    display:         'flex',
    justifyContent:  'space-between',
    alignItems:      'center',
    padding:         '10px 12px',
    backgroundColor: THEME.bgCard,
    borderRadius:    '12px',
    border:          `2px solid ${THEME.borderSolid}`,
    boxShadow:       '0 4px 16px rgba(0,0,0,0.35)',
  },
  headerLeft: {
    display:    'flex',
    alignItems: 'center',
    gap:        '6px',
  },
  headerLogo: { fontSize: '22px' },
  headerTitle: {
    fontSize:      '17px',
    fontWeight:    900,
    color:         THEME.text,
    letterSpacing: '0.05em',
  },
  cheerCountBadge: {
    fontSize:        '12px',
    fontWeight:      700,
    color:           THEME.textMuted,
    padding:         '5px 12px',
    backgroundColor: THEME.bgCardDeep,
    border:          `1px solid ${THEME.border}`,
    borderRadius:    '999px',
  },
  infoBanner: {
    display:         'flex',
    alignItems:      'center',
    gap:             '12px',
    padding:         '12px 14px',
    backgroundColor: THEME.bgCard,
    border:          `1px solid ${THEME.accent}`,
    borderLeft:      `4px solid ${THEME.accent}`,
    borderRadius:    '10px',
  },
  infoTitle: {
    fontSize:     '14px',
    fontWeight:   900,
    color:        THEME.text,
    marginBottom: '2px',
  },
  infoSub: {
    fontSize:   '12px',
    color:      THEME.textMuted,
    lineHeight: 1.5,
  },
  toast: {
    position:     'fixed',
    bottom:       '88px',
    left:         '50%',
    transform:    'translateX(-50%)',
    display:      'flex',
    alignItems:   'center',
    gap:          '8px',
    maxWidth:     '90%',
    padding:      '12px 18px',
    color:        THEME.text,
    fontSize:     '13px',
    fontWeight:   700,
    border:       `2px solid ${THEME.accent}`,
    borderRadius: '999px',
    boxShadow:    '0 6px 20px rgba(0,0,0,0.5)',
    zIndex:       400,
    animation:    'nakama_toast_in 0.3s ease both',
  },
  errorBox: {
    minHeight:       '100vh',
    display:         'flex',
    flexDirection:   'column',
    alignItems:      'center',
    justifyContent:  'center',
    padding:         '32px',
    backgroundColor: THEME.bg,
    textAlign:       'center',
  },
  errorIcon:    { fontSize: '48px', marginBottom: '12px' },
  errorTitle:   {
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
    padding:      '12px 28px',
    fontSize:     '15px',
    fontWeight:   900,
    color:        '#FFFFFF',
    background:   `linear-gradient(180deg, ${THEME.primary} 0%, ${THEME.primaryDark} 100%)`,
    border:       'none',
    borderRadius: '8px',
    cursor:       'pointer',
    boxShadow:    `0 4px 0 ${THEME.primaryDark}`,
  },
  skeletonLogo: {
    textAlign: 'center',
    padding:   '40px 20px 20px',
  },
  skeletonFlame: {
    fontSize:  '48px',
    animation: 'nakama_skel_flame 1.4s ease-in-out infinite',
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
    border:         '4px solid rgba(255,255,255,0.15)',
    borderTopColor: THEME.accent,
    borderRadius:   '50%',
    animation:      'nakama_skel_spin 0.9s linear infinite',
  },
  skeletonGraph: {
    width:   '100%',
    height:  '360px',
    padding: '0 4px',
  },
  skeletonBlock: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius:    '6px',
    animation:       'nakama_skel_pulse 1.4s ease-in-out infinite',
  },
};
