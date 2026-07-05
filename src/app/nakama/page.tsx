// src/app/nakama/page.tsx
// =====================================================================
// 燃えろ剣士 - なかま（門下生一覧・応援）画面
// 他の門下生の頑張りを見てモチベーションを高め合う「燃える絆」のページ
// Phase 8:   新規実装
// Phase 8.1: 散布図（2軸グラフ）ビュー追加
//            ・リスト表示 / グラフ表示 のタブ切替（初期はリスト）
//            ・Recharts ScatterChart で X=累計稽古日数 / Y=レベル をプロット
//            ・プロットタップで詳細＋応援ボタン付きモーダルを表示
//            ・自分のプロットはゴールドで強調（大きく光る）
// =====================================================================

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Cell,
} from 'recharts';
import {
  useNakamaListSWR,
  cheerStudent,
  type NakamaEntry,
} from '@/lib/api';
import { getAuthUser } from '@/lib/auth';
import { THEME, levelColor } from '@/types';

// =====================================================================
// 表示モード（タブ）
// =====================================================================
type ViewMode = 'list' | 'graph';

// 散布図のプロット1点（Recharts の data 用に整形）
interface ScatterPoint {
  x:      number;       // 累計稽古日数
  y:      number;       // レベル
  z:      number;       // ドットサイズ（自分を大きく）
  isSelf: boolean;      // 自分かどうか（色・サイズ切替）
  entry:  NakamaEntry;  // 元データ（モーダル表示用）
}

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

  // 表示モード（リスト／グラフ）。初期はリスト。
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // 応援中のユーザーID（連打防止＆スピナー表示用）
  const [cheeringId, setCheeringId] = useState<string | null>(null);
  // トースト（応援結果のフィードバック）
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  // ★ グラフ上で選択中のなかま（詳細モーダル表示用）
  const [selected, setSelected] = useState<NakamaEntry | null>(null);

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
      // モーダルを開いている場合は、選択中データも最新へ差し替える。
      if (selected && selected.user_id === nakama.user_id && res.cheered) {
        setSelected({ ...selected, cheeredTodayByMe: true });
      }
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
  // 散布図用データの整形（自分＋なかま）
  // ---------------------------------------------------------------
  const scatterData: ScatterPoint[] = useMemo(() => {
    if (!data) return [];
    const points: ScatterPoint[] = [];

    // なかま（他の門下生）
    for (const n of data.nakama) {
      points.push({
        x:      n.total_practice_days,
        y:      n.level,
        z:      100,
        isSelf: false,
        entry:  n,
      });
    }

    // ★ 自分（最後に積んで最前面に描画・大きく光る）
    if (data.my_data) {
      points.push({
        x:      data.my_data.total_practice_days,
        y:      data.my_data.level,
        z:      360, // 大きめのドット
        isSelf: true,
        entry:  data.my_data,
      });
    }

    return points;
  }, [data]);

  // 軸レンジ（余白を持たせて見やすく）
  const axisRange = useMemo(() => {
    if (scatterData.length === 0) {
      return { xMax: 10, yMax: 10 };
    }
    const maxX = Math.max(...scatterData.map((p) => p.x));
    const maxY = Math.max(...scatterData.map((p) => p.y));
    return {
      xMax: Math.max(10, Math.ceil((maxX + 2) / 5) * 5),
      yMax: Math.max(10, Math.ceil((maxY + 2) / 5) * 5),
    };
  }, [scatterData]);

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

        {/* ★ 表示切替タブ（リスト / グラフ） */}
        <div style={styles.tabBar} role="tablist" aria-label="表示切替">
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'list'}
            onClick={() => setViewMode('list')}
            style={{
              ...styles.tabBtn,
              ...(viewMode === 'list' ? styles.tabBtnActive : {}),
            }}
          >
            <span style={styles.tabEmoji}>📋</span>
            <span>リスト表示</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'graph'}
            onClick={() => setViewMode('graph')}
            style={{
              ...styles.tabBtn,
              ...(viewMode === 'graph' ? styles.tabBtnActive : {}),
            }}
          >
            <span style={styles.tabEmoji}>📊</span>
            <span>グラフ表示</span>
          </button>
        </div>

        {/* 説明バナー */}
        <div style={styles.infoBanner}>
          <span style={{ fontSize: '22px' }}>🎌</span>
          <div>
            <div style={styles.infoTitle}>なかまを応援しよう！</div>
            <div style={styles.infoSub}>
              {viewMode === 'list' ? (
                <>
                  応援すると おたがい <strong style={{ color: THEME.accent }}>5 XP</strong> ゲット！
                  （1人につき1日1回まで）
                </>
              ) : (
                <>
                  ドットをタップすると くわしく見れるよ！
                  <strong style={{ color: THEME.accent }}> 金色</strong>のドットが「キミ」だ🔥
                </>
              )}
            </div>
          </div>
        </div>

        {/* ============================================================
            リスト表示
        ============================================================ */}
        {viewMode === 'list' && (
          <>
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
          </>
        )}

        {/* ============================================================
            グラフ表示（散布図）
        ============================================================ */}
        {viewMode === 'graph' && (
          <div style={styles.graphCard}>
            {/* 凡例 */}
            <div style={styles.graphLegend}>
              <span style={styles.legendItem}>
                <span style={{ ...styles.legendDot, backgroundColor: THEME.accent }} />
                なかま
              </span>
              <span style={styles.legendItem}>
                <span
                  style={{
                    ...styles.legendDot,
                    background: 'radial-gradient(circle, #FFF7C0 0%, #FFD700 55%, #FFA000 100%)',
                    boxShadow: '0 0 8px rgba(255,215,0,0.9)',
                  }}
                />
                キミ
              </span>
            </div>

            {/* 散布図本体 */}
            <div style={styles.chartWrap}>
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart
                  margin={{ top: 16, right: 20, bottom: 40, left: 8 }}
                >
                  <CartesianGrid
                    stroke="rgba(255,255,255,0.10)"
                    strokeDasharray="3 3"
                  />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name="累計稽古日数"
                    domain={[0, axisRange.xMax]}
                    tick={{ fill: THEME.textMuted, fontSize: 11 }}
                    stroke="rgba(255,255,255,0.25)"
                    label={{
                      value:    '累計稽古日数（日）',
                      position: 'bottom',
                      offset:   16,
                      fill:     THEME.textSubtle,
                      fontSize: 12,
                    }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name="レベル"
                    domain={[0, axisRange.yMax]}
                    tick={{ fill: THEME.textMuted, fontSize: 11 }}
                    stroke="rgba(255,255,255,0.25)"
                    label={{
                      value:    'レベル',
                      angle:    -90,
                      position: 'insideLeft',
                      offset:   16,
                      fill:     THEME.textSubtle,
                      fontSize: 12,
                    }}
                  />
                  <ZAxis type="number" dataKey="z" range={[80, 400]} />
                  <Scatter
                    data={scatterData}
                    isAnimationActive={false}
                    onClick={(pt: any) => {
                      // Recharts はクリックした点の payload を渡す。
                      const entry = pt?.payload?.entry as NakamaEntry | undefined;
                      if (entry) setSelected(entry);
                    }}
                  >
                    {scatterData.map((p, i) => (
                      <Cell
                        key={`cell-${i}`}
                        fill={p.isSelf ? '#FFD700' : THEME.accent}
                        stroke={p.isSelf ? '#FFF7C0' : THEME.borderSolid}
                        strokeWidth={p.isSelf ? 3 : 1}
                        style={{
                          cursor: 'pointer',
                          filter: p.isSelf
                            ? 'drop-shadow(0 0 8px rgba(255,215,0,0.9))'
                            : 'none',
                        }}
                      />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>

            <div style={styles.graphHint}>
              右上にいくほど「たくさん稽古して、強い剣士」だ！キミはどこかな？🔥
            </div>
          </div>
        )}

        {/* フッター余白（ボトムナビ分） */}
        <div style={{ height: 80 }} />
      </div>

      {/* ============================================================
          詳細モーダル（グラフのドットタップ時）
      ============================================================ */}
      {selected && (
        <NakamaDetailModal
          nakama={selected}
          cheering={cheeringId === selected.user_id}
          disabled={cheeringId !== null}
          onCheer={() => handleCheer(selected)}
          onClose={() => setSelected(null)}
        />
      )}

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
        @keyframes nakama_modal_in {
          0%   { transform: translateY(24px) scale(0.96); opacity: 0; }
          100% { transform: translateY(0) scale(1);       opacity: 1; }
        }
        @keyframes nakama_overlay_in {
          0%   { opacity: 0; }
          100% { opacity: 1; }
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
// ★ なかま詳細モーダル（グラフのドットタップ時）
// -------------------------------------------------------------------
// 氏名 / 称号 / レベル / 獲得経験値 / 累計稽古日数 / 最終稽古日 を表示し、
// 応援ボタンを含む。自分自身の場合は応援ボタンを出さない。
// =====================================================================
function NakamaDetailModal({
  nakama,
  cheering,
  disabled,
  onCheer,
  onClose,
}: {
  nakama:   NakamaEntry;
  cheering: boolean;
  disabled: boolean;
  onCheer:  () => void;
  onClose:  () => void;
}) {
  const lvColor = levelColor(nakama.level);
  const alreadyCheered = nakama.cheeredTodayByMe;

  // 自分自身かどうか（自分には応援ボタンを出さない）。
  const me = typeof window !== 'undefined' ? getAuthUser() : null;
  const isSelf = me?.id === nakama.user_id;

  const lastLabel = formatLastPractice(
    nakama.last_practice_date,
    nakama.daysSinceLastPractice,
  );

  return (
    <div
      style={styles.overlay}
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        style={styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 閉じるボタン */}
        <button
          type="button"
          style={styles.modalClose}
          onClick={onClose}
          aria-label="閉じる"
        >
          ✕
        </button>

        {/* ヘッダー（炎 or 自分アピール） */}
        <div style={styles.modalHead}>
          <div style={styles.modalFlame}>
            {isSelf ? '⭐' : nakama.isBurning ? '🔥' : '💤'}
          </div>
          <div style={styles.modalNameRow}>
            <span style={styles.modalName}>{nakama.name}</span>
            {nakama.grade && (
              <span style={styles.gradeBadge}>{nakama.grade}年</span>
            )}
            {isSelf && <span style={styles.selfBadge}>キミ</span>}
          </div>
          <div style={styles.modalTitle}>「{nakama.title}」</div>
        </div>

        {/* ステータス表 */}
        <div style={styles.modalStats}>
          <div style={styles.statBox}>
            <div style={styles.statLabel}>レベル</div>
            <div style={{ ...styles.statValueBadge, backgroundColor: lvColor }}>
              Lv.{nakama.level}
            </div>
          </div>
          <div style={styles.statBox}>
            <div style={styles.statLabel}>獲得経験値</div>
            <div style={styles.statValue}>
              {nakama.total_xp.toLocaleString()} <span style={styles.statUnit}>XP</span>
            </div>
          </div>
          <div style={styles.statBox}>
            <div style={styles.statLabel}>累計稽古日数</div>
            <div style={styles.statValue}>
              {nakama.total_practice_days} <span style={styles.statUnit}>日</span>
            </div>
          </div>
          <div style={styles.statBox}>
            <div style={styles.statLabel}>最後の稽古</div>
            <div style={styles.statValueSmall}>{lastLabel}</div>
          </div>
        </div>

        {/* 応援ボタン（自分以外のときのみ） */}
        {!isSelf && (
          <button
            type="button"
            onClick={onCheer}
            disabled={disabled || alreadyCheered}
            style={{
              ...styles.modalCheerBtn,
              ...(alreadyCheered ? styles.modalCheerBtnDone : {}),
              ...(cheering ? styles.cheerBtnLoading : {}),
            }}
          >
            {cheering ? (
              <span style={styles.cheerSpinner} aria-hidden="true" />
            ) : alreadyCheered ? (
              <>
                <span style={{ fontSize: '20px' }}>✅</span>
                <span>今日は応援ずみ！</span>
              </>
            ) : (
              <>
                <span style={{ fontSize: '20px' }}>🎌</span>
                <span>{nakama.name}を応援する（+5 XP）</span>
              </>
            )}
          </button>
        )}

        {/* 自分の場合の一言 */}
        {isSelf && (
          <div style={styles.selfMessage}>
            🔥 これがキミの現在地だ！なかまに負けず、もっと上へ！
          </div>
        )}
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

  // ★ タブバー（リスト / グラフ）
  tabBar: {
    display:         'flex',
    gap:             '8px',
    padding:         '6px',
    backgroundColor: THEME.bgCardDeep,
    borderRadius:    '12px',
    border:          `1px solid ${THEME.border}`,
  },
  tabBtn: {
    flex:            1,
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             '6px',
    padding:         '10px 8px',
    fontFamily:      'inherit',
    fontSize:        '13px',
    fontWeight:      900,
    color:           THEME.textMuted,
    backgroundColor: 'transparent',
    border:          '2px solid transparent',
    borderRadius:    '9px',
    cursor:          'pointer',
    transition:      'all 0.15s ease',
    WebkitTapHighlightColor: 'transparent',
  },
  tabBtnActive: {
    color:           '#FFFFFF',
    background:      `linear-gradient(180deg, ${THEME.primary} 0%, ${THEME.primaryDark} 100%)`,
    border:          `2px solid ${THEME.borderSolid}`,
    boxShadow:       '0 3px 10px rgba(255,68,68,0.35)',
  },
  tabEmoji: { fontSize: '16px' },

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

  // ★ グラフカード
  graphCard: {
    display:         'flex',
    flexDirection:   'column',
    gap:             '10px',
    padding:         '14px 10px 10px',
    backgroundColor: THEME.bgCard,
    border:          `2px solid ${THEME.border}`,
    borderRadius:    '14px',
    boxShadow:       '0 3px 12px rgba(0,0,0,0.3)',
  },
  graphLegend: {
    display:        'flex',
    justifyContent: 'center',
    gap:            '18px',
    padding:        '0 4px',
  },
  legendItem: {
    display:    'flex',
    alignItems: 'center',
    gap:        '6px',
    fontSize:   '12px',
    fontWeight: 700,
    color:      THEME.textMuted,
  },
  legendDot: {
    width:        '14px',
    height:       '14px',
    borderRadius: '50%',
    display:      'inline-block',
  },
  chartWrap: {
    width:  '100%',
    height: '360px',
  },
  graphHint: {
    textAlign:  'center',
    fontSize:   '11px',
    fontWeight: 700,
    color:      THEME.textSubtle,
    padding:    '0 8px',
    lineHeight: 1.5,
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

  // ★ 詳細モーダル
  overlay: {
    position:        'fixed',
    inset:           0,
    zIndex:          300,
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    padding:         '20px',
    backgroundColor: 'rgba(0,0,0,0.65)',
    backdropFilter:  'blur(2px)',
    animation:       'nakama_overlay_in 0.2s ease both',
  },
  modal: {
    position:        'relative',
    width:           '100%',
    maxWidth:        '360px',
    padding:         '22px 20px 20px',
    backgroundColor: THEME.bgCard,
    border:          `2px solid ${THEME.borderSolid}`,
    borderRadius:    '18px',
    boxShadow:       '0 12px 40px rgba(0,0,0,0.6)',
    animation:       'nakama_modal_in 0.28s cubic-bezier(0.2,0.8,0.3,1.2) both',
  },
  modalClose: {
    position:        'absolute',
    top:             '10px',
    right:           '10px',
    width:           '32px',
    height:          '32px',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    fontSize:        '16px',
    fontWeight:      900,
    color:           THEME.textMuted,
    backgroundColor: THEME.bgCardDeep,
    border:          `1px solid ${THEME.border}`,
    borderRadius:    '50%',
    cursor:          'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
  modalHead: {
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    gap:            '4px',
    marginBottom:   '16px',
  },
  modalFlame: {
    fontSize:  '40px',
    animation: 'nakama_flame_flicker 1.1s ease-in-out infinite',
  },
  modalNameRow: {
    display:    'flex',
    alignItems: 'center',
    gap:        '6px',
    flexWrap:   'wrap',
    justifyContent: 'center',
  },
  modalName: {
    fontSize:   '20px',
    fontWeight: 900,
    color:      THEME.text,
  },
  selfBadge: {
    fontSize:        '10px',
    fontWeight:      900,
    color:           '#1A0000',
    padding:         '2px 8px',
    background:      'linear-gradient(180deg, #FFF7C0 0%, #FFD700 100%)',
    borderRadius:    '999px',
    boxShadow:       '0 0 6px rgba(255,215,0,0.7)',
  },
  modalTitle: {
    fontSize:   '13px',
    fontWeight: 700,
    color:      THEME.accent,
  },
  modalStats: {
    display:             'grid',
    gridTemplateColumns: '1fr 1fr',
    gap:                 '8px',
    marginBottom:        '18px',
  },
  statBox: {
    display:         'flex',
    flexDirection:   'column',
    alignItems:      'center',
    gap:             '4px',
    padding:         '10px 6px',
    backgroundColor: THEME.bgCardDeep,
    border:          `1px solid ${THEME.border}`,
    borderRadius:    '10px',
  },
  statLabel: {
    fontSize:   '10px',
    fontWeight: 700,
    color:      THEME.textSubtle,
  },
  statValue: {
    fontSize:   '18px',
    fontWeight: 900,
    color:      THEME.text,
  },
  statValueSmall: {
    fontSize:   '13px',
    fontWeight: 900,
    color:      THEME.text,
    textAlign:  'center',
  },
  statValueBadge: {
    fontSize:     '15px',
    fontWeight:   900,
    color:        '#1A0000',
    padding:      '3px 12px',
    borderRadius: '8px',
    textShadow:   '0 1px 0 rgba(255,255,255,0.25)',
  },
  statUnit: {
    fontSize:   '11px',
    fontWeight: 700,
    color:      THEME.textMuted,
  },
  modalCheerBtn: {
    width:           '100%',
    minHeight:       '52px',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             '8px',
    fontFamily:      'inherit',
    fontSize:        '15px',
    fontWeight:      900,
    color:           '#FFFFFF',
    background:      `linear-gradient(180deg, #FF5555 0%, ${THEME.primary} 50%, ${THEME.primaryDark} 100%)`,
    border:          `2px solid ${THEME.borderSolid}`,
    borderRadius:    '12px',
    cursor:          'pointer',
    boxShadow:       '0 3px 10px rgba(255,68,68,0.4)',
    WebkitTapHighlightColor: 'transparent',
  },
  modalCheerBtnDone: {
    background: THEME.bgCardDeep,
    border:     `2px solid ${THEME.border}`,
    boxShadow:  'none',
    cursor:     'default',
    color:      THEME.textSubtle,
  },
  selfMessage: {
    textAlign:       'center',
    fontSize:        '13px',
    fontWeight:      700,
    color:           THEME.accent,
    padding:         '12px',
    backgroundColor: THEME.bgCardDeep,
    border:          `1px solid ${THEME.accent}`,
    borderRadius:    '10px',
    lineHeight:      1.5,
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
    zIndex:       400,
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
