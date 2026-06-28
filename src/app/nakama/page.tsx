// src/app/nakama/page.tsx
// =====================================================================
// 燃えろ剣士 - なかま（門下生一覧・応援）画面
// 他の門下生の頑張りを見てモチベーションを高め合う「燃える絆」のページ
// Phase 8: 新規実装
// =====================================================================

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useNakamaListSWR,
  cheerStudent,
  type NakamaEntry,
} from '@/lib/api';
import { getAuthUser } from '@/lib/auth';
import { THEME, levelColor } from '@/types';

export default function NakamaPage() {
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
  const { data, error, isLoading, mutate } = useNakamaListSWR();

  // 応援中のユーザーID（連打防止＆スピナー表示用）
  const [cheeringId, setCheeringId] = useState<string | null>(null);
  // トースト（応援結果のフィードバック）
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  // ---------------------------------------------------------------
  // 応援ハンドラ
  // ---------------------------------------------------------------
  const handleCheer = async (nakama: NakamaEntry) => {
    if (cheeringId) return; // 多重実行防止
    if (nakama.cheeredTodayByMe) return; // 既に応援済み

    setCheeringId(nakama.user_id);
    try {
      const res = await cheerStudent(nakama.user_id);
      setToast({ text: res.message, ok: res.cheered });
      // 一覧を再取得（応援済みフラグ・XPを即反映）
      await mutate();
    } catch (e) {
      setToast({
        text: e instanceof Error ? e.message : '応援に失敗しました…',
        ok:   false,
      });
    } finally {
      setCheeringId(null);
      // トーストは数秒で消す
      setTimeout(() => setToast(null), 3000);
    }
  };

  // ---------------------------------------------------------------
  // ローディング
  // ---------------------------------------------------------------
  if (!user || isLoading) {
    return <NakamaSkeleton />;
  }

  // ---------------------------------------------------------------
  // エラー
  // ---------------------------------------------------------------
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

  const { nakama, cheeredToday } = data;

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
            <span style={styles.headerTitle}>なかまの修行</span>
          </div>
          <div style={styles.cheerCountBadge}>
            今日の応援 <strong style={{ color: THEME.accent }}>{cheeredToday}</strong> 人
          </div>
        </header>

        {/* 説明バナー */}
        <div style={styles.infoBanner}>
          <span style={{ fontSize: '22px' }}>🎌</span>
          <div>
            <div style={styles.infoTitle}>なかまを応援しよう！</div>
            <div style={styles.infoSub}>
              応援すると おたがい <strong style={{ color: THEME.accent }}>5 XP</strong> ゲット！
              （1人につき1日1回まで）
            </div>
          </div>
        </div>

        {/* なかまリスト */}
        {nakama.length === 0 ? (
          <div style={styles.emptyBox}>
            <div style={{ fontSize: '40px', marginBottom: 8 }}>🥷</div>
            <div style={styles.emptyText}>まだ ほかの門下生がいないよ</div>
          </div>
        ) : (
          <div style={styles.list}>
            {nakama.map((n, idx) => (
              <NakamaRow
                key={n.user_id}
                nakama={n}
                rank={idx + 1}
                cheering={cheeringId === n.user_id}
                disabled={cheeringId !== null}
                onCheer={() => handleCheer(n)}
              />
            ))}
          </div>
        )}

        {/* フッター余白（ボトムナビ分） */}
        <div style={{ height: 80 }} />
      </div>

      {/* トースト */}
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
        @keyframes nakama_flame_flicker {
          0%, 100% { transform: scale(1) rotate(-4deg); opacity: 1; }
          50%      { transform: scale(1.18) rotate(4deg); opacity: 0.85; }
        }
        @keyframes nakama_flame_glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,68,68,0.0), inset 0 0 0 0 rgba(255,68,68,0.0); }
          50%      { box-shadow: 0 0 14px 2px rgba(255,68,68,0.35), inset 0 0 8px 0 rgba(255,140,0,0.18); }
        }
        @keyframes nakama_cheer_pop {
          0%   { transform: scale(1); }
          40%  { transform: scale(1.25); }
          100% { transform: scale(1); }
        }
        @keyframes nakama_toast_in {
          0%   { transform: translate(-50%, 20px); opacity: 0; }
          100% { transform: translate(-50%, 0);    opacity: 1; }
        }
        @keyframes nakama_skel_pulse {
          0%, 100% { opacity: 0.5; }
          50%      { opacity: 1; }
        }
        @keyframes nakama_spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// =====================================================================
// なかま1行（カード）
// =====================================================================
function NakamaRow({
  nakama,
  rank,
  cheering,
  disabled,
  onCheer,
}: {
  nakama:   NakamaEntry;
  rank:     number;
  cheering: boolean;
  disabled: boolean;
  onCheer:  () => void;
}) {
  const lvColor = levelColor(nakama.level);
  const alreadyCheered = nakama.cheeredTodayByMe;

  // 最終稽古日の表示（YYYY-MM-DD / 「まだ」）
  const lastLabel = formatLastPractice(
    nakama.last_practice_date,
    nakama.daysSinceLastPractice,
  );

  // ランクメダル（上位3名）
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;

  return (
    <div
      style={{
        ...styles.row,
        ...(nakama.isBurning ? styles.rowBurning : {}),
      }}
    >
      {/* 順位 */}
      <div style={styles.rankCol}>
        {medal ? (
          <span style={styles.medal}>{medal}</span>
        ) : (
          <span style={styles.rankNum}>{rank}</span>
        )}
      </div>

      {/* 燃え盛りアイコン or レベルバッジ */}
      <div style={styles.flameCol}>
        {nakama.isBurning ? (
          <span style={styles.burningFlame} aria-label="燃えている">🔥</span>
        ) : (
          <span style={styles.coldMark} aria-hidden="true">💤</span>
        )}
      </div>

      {/* 名前・称号・ステータス */}
      <div style={styles.infoCol}>
        <div style={styles.nameRow}>
          <span style={styles.name}>{nakama.name}</span>
          {nakama.grade && (
            <span style={styles.gradeBadge}>{nakama.grade}年</span>
          )}
        </div>
        <div style={styles.title}>「{nakama.title}」</div>
        <div style={styles.statRow}>
          <span style={{ ...styles.levelBadge, backgroundColor: lvColor }}>
            Lv.{nakama.level}
          </span>
          <span style={styles.xpText}>{nakama.total_xp.toLocaleString()} XP</span>
          <span style={styles.lastText}>{lastLabel}</span>
        </div>
      </div>

      {/* 応援ボタン */}
      <div style={styles.cheerCol}>
        <button
          type="button"
          onClick={onCheer}
          disabled={disabled || alreadyCheered}
          aria-label={alreadyCheered ? '応援ずみ' : `${nakama.name}を応援する`}
          style={{
            ...styles.cheerBtn,
            ...(alreadyCheered ? styles.cheerBtnDone : {}),
            ...(cheering ? styles.cheerBtnLoading : {}),
          }}
          onTouchStart={(e) => {
            if (!alreadyCheered && !disabled)
              e.currentTarget.style.transform = 'scale(0.9)';
          }}
          onTouchEnd={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
          onMouseDown={(e) => {
            if (!alreadyCheered && !disabled)
              e.currentTarget.style.transform = 'scale(0.92)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          {cheering ? (
            <span style={styles.cheerSpinner} aria-hidden="true" />
          ) : alreadyCheered ? (
            <>
              <span style={styles.cheerBtnEmoji}>✅</span>
              <span style={styles.cheerBtnLabel}>応援ずみ</span>
            </>
          ) : (
            <>
              <span style={styles.cheerBtnEmoji}>🎌</span>
              <span style={styles.cheerBtnLabel}>応援</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// =====================================================================
// 最終稽古日のラベル整形
// =====================================================================
function formatLastPractice(
  last: string | null,
  days: number | null,
): string {
  if (last == null || days == null) return 'まだ稽古なし';
  if (days <= 0) return '今日 稽古した！';
  if (days === 1) return 'きのう 稽古';
  if (days <= 3) return `${days}日前に稽古`;
  return `${days}日 お休み中`;
}

// =====================================================================
// スケルトンUI
// =====================================================================
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

        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={styles.skeletonRow}>
            <div style={{ ...styles.skeletonBlock, width: 30, height: 30, borderRadius: '50%' }} />
            <div style={{ flex: 1 }}>
              <div style={{ ...styles.skeletonBlock, width: '50%', height: 16, marginBottom: 8 }} />
              <div style={{ ...styles.skeletonBlock, width: '70%', height: 12 }} />
            </div>
            <div style={{ ...styles.skeletonBlock, width: 56, height: 48, borderRadius: 12 }} />
          </div>
        ))}
      </div>

      <style>{`
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
    position:      'relative',
    zIndex:        1,
    maxWidth:      '720px',
    margin:        '0 auto',
    padding:       '12px 14px 0',
    display:       'flex',
    flexDirection: 'column',
    gap:           '12px',
  },

  // ヘッダー
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

  // 説明バナー
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

  // リスト
  list: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '10px',
  },

  // 1行（カード）
  row: {
    display:         'flex',
    alignItems:      'center',
    gap:             '10px',
    padding:         '12px 12px',
    backgroundColor: THEME.bgCard,
    border:          `2px solid ${THEME.border}`,
    borderRadius:    '14px',
    boxShadow:       '0 3px 12px rgba(0,0,0,0.3)',
    transition:      'transform 0.15s ease',
  },
  // ★ 燃え盛り（3日以内稽古）の行
  rowBurning: {
    border:     `2px solid ${THEME.primary}`,
    background: `linear-gradient(135deg, ${THEME.bgCard} 0%, #6E1212 100%)`,
    animation:  'nakama_flame_glow 2.2s ease-in-out infinite',
  },

  // 順位
  rankCol: {
    width:          '28px',
    flexShrink:     0,
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
  },
  medal:   { fontSize: '22px' },
  rankNum: {
    fontSize:   '15px',
    fontWeight: 900,
    color:      THEME.textSubtle,
  },

  // 炎カラム
  flameCol: {
    width:          '30px',
    flexShrink:     0,
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
  },
  burningFlame: {
    fontSize:  '26px',
    animation: 'nakama_flame_flicker 0.9s ease-in-out infinite',
    filter:    'drop-shadow(0 0 6px rgba(255,120,0,0.7))',
  },
  coldMark: {
    fontSize: '20px',
    opacity:  0.5,
  },

  // 情報カラム
  infoCol: {
    flex:          1,
    minWidth:      0,
    display:       'flex',
    flexDirection: 'column',
    gap:           '3px',
  },
  nameRow: {
    display:    'flex',
    alignItems: 'center',
    gap:        '6px',
  },
  name: {
    fontSize:     '16px',
    fontWeight:   900,
    color:        THEME.text,
    whiteSpace:   'nowrap',
    overflow:     'hidden',
    textOverflow: 'ellipsis',
  },
  gradeBadge: {
    fontSize:        '10px',
    fontWeight:      700,
    color:           THEME.textMuted,
    padding:         '1px 6px',
    backgroundColor: THEME.bgCardDeep,
    borderRadius:    '999px',
    flexShrink:      0,
  },
  title: {
    fontSize:     '12px',
    fontWeight:   700,
    color:        THEME.accent,
    whiteSpace:   'nowrap',
    overflow:     'hidden',
    textOverflow: 'ellipsis',
  },
  statRow: {
    display:    'flex',
    alignItems: 'center',
    gap:        '8px',
    flexWrap:   'wrap',
  },
  levelBadge: {
    fontSize:     '11px',
    fontWeight:   900,
    color:        '#1A0000',
    padding:      '2px 8px',
    borderRadius: '6px',
    textShadow:   '0 1px 0 rgba(255,255,255,0.25)',
  },
  xpText: {
    fontSize:   '12px',
    fontWeight: 700,
    color:      THEME.textMuted,
  },
  lastText: {
    fontSize: '11px',
    color:    THEME.textSubtle,
  },

  // 応援ボタンカラム
  cheerCol: {
    flexShrink: 0,
  },
  cheerBtn: {
    minWidth:        '60px',
    minHeight:       '52px',
    padding:         '6px 8px',
    display:         'flex',
    flexDirection:   'column',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             '2px',
    fontFamily:      'inherit',
    color:           '#FFFFFF',
    background:      `linear-gradient(180deg, #FF5555 0%, ${THEME.primary} 50%, ${THEME.primaryDark} 100%)`,
    border:          `2px solid ${THEME.borderSolid}`,
    borderRadius:    '12px',
    cursor:          'pointer',
    transition:      'transform 0.1s ease',
    boxShadow:       '0 3px 10px rgba(255,68,68,0.4)',
    WebkitTapHighlightColor: 'transparent',
  },
  cheerBtnDone: {
    background: THEME.bgCardDeep,
    border:     `2px solid ${THEME.border}`,
    boxShadow:  'none',
    cursor:     'default',
    color:      THEME.textSubtle,
  },
  cheerBtnLoading: {
    opacity: 0.8,
    cursor:  'wait',
  },
  cheerBtnEmoji: {
    fontSize:   '20px',
    lineHeight: 1,
  },
  cheerBtnLabel: {
    fontSize:   '11px',
    fontWeight: 900,
    lineHeight: 1,
  },
  cheerSpinner: {
    width:          '20px',
    height:         '20px',
    border:         '3px solid rgba(255,255,255,0.3)',
    borderTopColor: '#FFFFFF',
    borderRadius:   '50%',
    animation:      'nakama_spin 0.7s linear infinite',
  },

  // 空状態
  emptyBox: {
    textAlign:       'center',
    padding:         '40px 20px',
    backgroundColor: THEME.bgCard,
    border:          `2px dashed ${THEME.border}`,
    borderRadius:    '14px',
  },
  emptyText: {
    fontSize:   '14px',
    fontWeight: 700,
    color:      THEME.textMuted,
  },

  // トースト
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
    zIndex:       200,
    animation:    'nakama_toast_in 0.3s ease both',
  },

  // エラー
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

  // スケルトン
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
    border:         `4px solid rgba(255,255,255,0.15)`,
    borderTopColor: THEME.accent,
    borderRadius:   '50%',
    animation:      'nakama_skel_spin 0.9s linear infinite',
  },
  skeletonRow: {
    display:         'flex',
    alignItems:      'center',
    gap:             '10px',
    padding:         '12px',
    backgroundColor: THEME.bgCard,
    border:          `2px solid ${THEME.border}`,
    borderRadius:    '14px',
    marginBottom:    '10px',
  },
  skeletonBlock: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius:    '6px',
    animation:       'nakama_skel_pulse 1.4s ease-in-out infinite',
  },
};
