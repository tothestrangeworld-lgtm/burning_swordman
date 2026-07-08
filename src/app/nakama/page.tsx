// src/app/nakama/page.tsx
// =====================================================================
// 燃えろ剣士 - なかま（門下生・切磋琢磨マップ）画面
// 他の門下生の頑張りを散布図で可視化し、切磋琢磨のモチベーションを高め合う
// Phase 8:   新規実装
// Phase 8.1: 散布図（2軸グラフ）ビュー追加
// Phase 8.2: UI/UXリファクタリング（リスト廃止・インラインポップアップ・青/金配色）
// Phase 8.3: ズーム＆頭文字ラベル対応
//            ・＋/−/リセットでチャートを拡大縮小（スクロール＆ドラッグで移動）
//              → 密集地帯のポイントも指で確実にタップできる
//            ・各プロットに名前の先頭1文字を描画（誰のポイントか一目でわかる）
// =====================================================================

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
} from 'recharts';
import {
  useNakamaListSWR,
  cheerStudent,
  type NakamaEntry,
} from '@/lib/api';
import { getAuthUser } from '@/lib/auth';
import { THEME, levelColor } from '@/types';

// =====================================================================
// 配色定数（視認性向上）
// -------------------------------------------------------------------
// ★ Phase 8.2: なかま＝青系（水色）、自分＝金色 で明確に区別する。
// =====================================================================
const NAKAMA_COLOR = '#4DB8FF';      // なかま（水色）
const NAKAMA_STROKE = '#1E88E5';     // なかまの縁取り（濃い青）
const SELF_COLOR = '#FFD700';        // 自分（ゴールド）
const SELF_STROKE = '#FFF7C0';       // 自分の縁取り（淡い金）

// =====================================================================
// ズーム設定（Phase 8.3）
// -------------------------------------------------------------------
// チャート自体を zoom 倍に拡大し、ラッパーの overflow スクロールで移動する。
// =====================================================================
const ZOOM_MIN = 1;      // 等倍（全体表示）
const ZOOM_MAX = 4;      // 最大4倍
const ZOOM_STEP = 0.5;   // ＋/− の刻み

// 散布図のプロット1点（Recharts の data 用に整形）
interface ScatterPoint {
  x:      number;       // 累計稽古日数
  y:      number;       // レベル
  z:      number;       // ドットサイズ（自分を大きく）
  isSelf: boolean;      // 自分かどうか（色・サイズ切替）
  initial: string;      // ★ 名前の先頭1文字（プロット内に描画）
  entry:  NakamaEntry;  // 元データ（ポップアップ表示用）
}

// ★ インラインポップアップの状態（選択中データ＋クリック座標）
interface PopupState {
  entry: NakamaEntry;
  // グラフスクロール領域左上を基準としたプロットの座標（px）
  cx:    number;
  cy:    number;
}

// ポップアップのおおよそのサイズ（フリップ判定に使用）
const POPUP_W = 240;
const POPUP_H = 220;

// =====================================================================
// 名前の先頭1文字を安全に取り出す（サロゲートペア／絵文字対応）
// =====================================================================
function firstChar(name: string): string {
  if (!name) return '?';
  // Array.from で1コードポイント単位に分割し、先頭を取得する。
  return Array.from(name.trim())[0] ?? '?';
}

// =====================================================================
// ★ カスタムプロット図形（円＋名前の頭文字）
// -------------------------------------------------------------------
// Recharts の Scatter shape へ渡す。cx/cy/payload が供給される。
// 自分は大きめ・ゴールド・グロー、なかまは水色で描画する。
// =====================================================================
function NakamaDot(props: any) {
  const { cx, cy, payload } = props;
  if (typeof cx !== 'number' || typeof cy !== 'number' || !payload) {
    return null;
  }
  const p = payload as ScatterPoint;
  const r = p.isSelf ? 16 : 13;                 // 半径
  const fill = p.isSelf ? SELF_COLOR : NAKAMA_COLOR;
  const stroke = p.isSelf ? SELF_STROKE : NAKAMA_STROKE;
  const strokeWidth = p.isSelf ? 3 : 1.5;
  // 頭文字の色: 明るい塗り（金・水色）に対して濃色で可読性を確保。
  const textColor = p.isSelf ? '#5A3B00' : '#0A2A45';

  return (
    <g style={{ cursor: 'pointer' }}>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        style={{
          filter: p.isSelf
            ? 'drop-shadow(0 0 8px rgba(255,215,0,0.9))'
            : 'none',
        }}
      />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={p.isSelf ? 15 : 12}
        fontWeight={900}
        fill={textColor}
        // テキストがクリックを奪ってドット選択を邪魔しないように。
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {p.initial}
      </text>
    </g>
  );
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

  // 応援中のユーザーID（連打防止＆スピナー表示用）
  const [cheeringId, setCheeringId] = useState<string | null>(null);
  // トースト（応援結果のフィードバック）
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  // ★ インラインポップアップの状態（null で非表示）
  const [popup, setPopup] = useState<PopupState | null>(null);
  // ★ Phase 8.3: ズーム倍率
  const [zoom, setZoom] = useState<number>(ZOOM_MIN);

  // 外枠（スクロールビューポート）とチャート実体の ref
  const scrollRef = useRef<HTMLDivElement | null>(null);   // overflow: auto の枠
  const chartInnerRef = useRef<HTMLDivElement | null>(null); // 拡大されるチャート実体

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
      // ポップアップを開いている場合は、選択中データも最新へ差し替える。
      setPopup((prev) =>
        prev && prev.entry.user_id === nakama.user_id && res.cheered
          ? { ...prev, entry: { ...prev.entry, cheeredTodayByMe: true } }
          : prev,
      );
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
  // ズーム操作
  // ---------------------------------------------------------------
  const clampZoom = (z: number) =>
    Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 10) / 10));

  const zoomIn = () => {
    setPopup(null); // ズームでポップアップは閉じる（座標がずれるため）
    setZoom((z) => clampZoom(z + ZOOM_STEP));
  };
  const zoomOut = () => {
    setPopup(null);
    setZoom((z) => clampZoom(z - ZOOM_STEP));
  };
  const zoomReset = () => {
    setPopup(null);
    setZoom(ZOOM_MIN);
    // スクロール位置も左上へ戻す。
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
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
        y:      n.total_xp,            // ★ レベル → 累計経験値(XP) へ変更
        z:      100,
        isSelf: false,
        initial: firstChar(n.name),
        entry:  n,
      });
    }

    // ★ 自分（最後に積んで最前面に描画・大きく光る）
    if (data.my_data) {
      points.push({
        x:      data.my_data.total_practice_days,
        y:      data.my_data.total_xp,  // ★ レベル → 累計経験値(XP) へ変更
        z:      360, // 大きめのドット
        isSelf: true,
        initial: firstChar(data.my_data.name),
        entry:  data.my_data,
      });
    }

    return points;
  }, [data]);

  // 軸レンジ（余白を持たせて見やすく）
  // ★ Y軸は XP。値が大きくなり得るため、桁に応じてキリの良い上限へ丸める。
  const axisRange = useMemo(() => {
    if (scatterData.length === 0) {
      return { xMax: 10, yMax: 100 };
    }
    const maxX = Math.max(...scatterData.map((p) => p.x));
    const maxY = Math.max(...scatterData.map((p) => p.y));

    // X（稽古日数）は従来どおり 5 刻みで丸める。
    const xMax = Math.max(10, Math.ceil((maxX + 2) / 5) * 5);

    // Y（XP）は最大値に約10%の余白を足し、桁に応じたキリの良い単位へ切り上げる。
    const yPadded = maxY * 1.1;
    // 丸め単位: 100未満→10, 1000未満→100, 10000未満→500, それ以上→1000。
    const step =
      yPadded < 100 ? 10
      : yPadded < 1000 ? 100
      : yPadded < 10000 ? 500
      : 1000;
    const yMax = Math.max(step, Math.ceil(yPadded / step) * step);

    return { xMax, yMax };
  }, [scatterData]);

  // ---------------------------------------------------------------
  // ★ ポップアップの表示位置を計算（画面端で見切れないよう自動フリップ）
  // -------------------------------------------------------------------
  // 座標はスクロール領域（拡大チャート）内の絶対座標。ポップアップも同じ
  // 拡大レイヤ上に置くため、スクロールしても追従する。
  // ---------------------------------------------------------------
  const popupPos = useMemo(() => {
    if (!popup) return null;
    const inner = chartInnerRef.current;
    const areaW = inner?.clientWidth ?? 320;
    const areaH = inner?.clientHeight ?? 360;

    const gap = 14; // プロットとの間隔

    // --- 横位置: 基本は右側。右に収まらなければ左側へフリップ。 ---
    let left = popup.cx + gap;
    if (left + POPUP_W > areaW) {
      left = popup.cx - gap - POPUP_W;
    }
    if (left < 4) left = 4;
    if (left + POPUP_W > areaW - 4) left = Math.max(4, areaW - 4 - POPUP_W);

    // --- 縦位置: プロット中心に対して縦センター。上下端をクランプ。 ---
    let top = popup.cy - POPUP_H / 2;
    if (top < 4) top = 4;
    if (top + POPUP_H > areaH - 4) top = Math.max(4, areaH - 4 - POPUP_H);

    return { left, top };
  }, [popup]);

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

  const { cheeredToday } = data;
  const zoomPct = Math.round(zoom * 100);

  // ---------------------------------------------------------------
  // メインビュー（常に散布図のみ）
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
            <span style={styles.headerTitle}>なかまの修行マップ</span>
          </div>
          <div style={styles.cheerCountBadge}>
            今日の応援 <strong style={{ color: THEME.accent }}>{cheeredToday}</strong> 人
          </div>
        </header>

        {/* 説明バナー */}
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

        {/* ============================================================
            グラフ表示（散布図＋ズーム）
        ============================================================ */}
        <div style={styles.graphCard}>
          {/* 凡例＋ズームコントロール */}
          <div style={styles.graphTopBar}>
            <div style={styles.graphLegend}>
              <span style={styles.legendItem}>
                <span
                  style={{
                    ...styles.legendDot,
                    backgroundColor: NAKAMA_COLOR,
                    border:          `2px solid ${NAKAMA_STROKE}`,
                  }}
                />
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

            {/* ★ ズームコントロール */}
            <div style={styles.zoomBar} role="group" aria-label="ズーム操作">
              <button
                type="button"
                onClick={zoomOut}
                disabled={zoom <= ZOOM_MIN}
                aria-label="ズームアウト"
                style={{
                  ...styles.zoomBtn,
                  ...(zoom <= ZOOM_MIN ? styles.zoomBtnDisabled : {}),
                }}
              >
                −
              </button>
              <button
                type="button"
                onClick={zoomReset}
                aria-label="ズームをリセット"
                style={styles.zoomResetBtn}
              >
                {zoomPct}%
              </button>
              <button
                type="button"
                onClick={zoomIn}
                disabled={zoom >= ZOOM_MAX}
                aria-label="ズームイン"
                style={{
                  ...styles.zoomBtn,
                  ...(zoom >= ZOOM_MAX ? styles.zoomBtnDisabled : {}),
                }}
              >
                ＋
              </button>
            </div>
          </div>

          {/* スクロールビューポート（拡大時はドラッグ／スワイプで移動可能） */}
          <div
            ref={scrollRef}
            style={{
              ...styles.chartScroll,
              // 拡大中のみスクロール可能に（等倍では固定表示）。
              overflow: zoom > ZOOM_MIN ? 'auto' : 'hidden',
              cursor:   zoom > ZOOM_MIN ? 'grab' : 'default',
            }}
          >
            {/* 拡大されるチャート実体（幅・高さを zoom 倍にする） */}
            <div
              ref={chartInnerRef}
              style={{
                position: 'relative',
                width:    `${100 * zoom}%`,
                height:   `${360 * zoom}px`,
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart
                  margin={{ top: 16, right: 24, bottom: 40, left: 8 }}
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
                    name="累計経験値"
                    domain={[0, axisRange.yMax]}
                    tick={{ fill: THEME.textMuted, fontSize: 11 }}
                    stroke="rgba(255,255,255,0.25)"
                    width={44}
                    // ★ XPは桁が大きいので短縮表示（例: 1200 → 1.2k）。
                    tickFormatter={(v: number) =>
                      v >= 1000 ? `${(v / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(v)
                    }
                    label={{
                      value:    '累計経験値（XP）',
                      angle:    -90,
                      position: 'insideLeft',
                      offset:   12,
                      fill:     THEME.textSubtle,
                      fontSize: 12,
                    }}
                  />
                  <ZAxis type="number" dataKey="z" range={[80, 400]} />
                  <Scatter
                    data={scatterData}
                    isAnimationActive={false}
                    // ★ 頭文字入りカスタム図形
                    shape={<NakamaDot />}
                    onClick={(pt: any) => {
                      // Recharts はクリックした点の payload と描画座標(cx/cy)を渡す。
                      const entry = pt?.payload?.entry as NakamaEntry | undefined;
                      if (!entry) return;
                      const cx = typeof pt?.cx === 'number' ? pt.cx : 0;
                      const cy = typeof pt?.cy === 'number' ? pt.cy : 0;
                      setPopup({ entry, cx, cy });
                    }}
                  />
                </ScatterChart>
              </ResponsiveContainer>

              {/* ★ インラインポップアップ（拡大レイヤ上に配置＝スクロール追従） */}
              {popup && popupPos && (
                <>
                  {/* 透明オーバーレイ: 外側タップで閉じる */}
                  <div
                    style={styles.popupCatcher}
                    onClick={() => setPopup(null)}
                    aria-hidden="true"
                  />
                  <InlinePopup
                    entry={popup.entry}
                    left={popupPos.left}
                    top={popupPos.top}
                    cheering={cheeringId === popup.entry.user_id}
                    disabled={cheeringId !== null}
                    onCheer={() => handleCheer(popup.entry)}
                    onClose={() => setPopup(null)}
                  />
                </>
              )}
            </div>
          </div>

          <div style={styles.graphHint}>
            {zoom > ZOOM_MIN
              ? '指でスワイプして見たい場所へ移動できるよ！'
              : '右上にいくほど「たくさん稽古して、強い剣士」だ！🔥'}
          </div>
        </div>

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
        @keyframes nakama_popup_in {
          0%   { transform: scale(0.85); opacity: 0; }
          100% { transform: scale(1);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// =====================================================================
// ★ インラインポップアップ（散布図のプロット横に出るコンパクトカード）
// -------------------------------------------------------------------
// 氏名 / 称号 / レベル / 獲得経験値 / 累計稽古日数 / 最終稽古日 を表示し、
// 応援ボタンを含む。自分自身の場合は応援ボタンを出さない。
// left/top は拡大チャートレイヤ左上を基準とした絶対座標（px）。
// =====================================================================
function InlinePopup({
  entry,
  left,
  top,
  cheering,
  disabled,
  onCheer,
  onClose,
}: {
  entry:    NakamaEntry;
  left:     number;
  top:      number;
  cheering: boolean;
  disabled: boolean;
  onCheer:  () => void;
  onClose:  () => void;
}) {
  const lvColor = levelColor(entry.level);
  const alreadyCheered = entry.cheeredTodayByMe;

  // 自分自身かどうか（自分には応援ボタンを出さない）。
  const me = typeof window !== 'undefined' ? getAuthUser() : null;
  const isSelf = me?.id === entry.user_id;

  const lastLabel = formatLastPractice(
    entry.last_practice_date,
    entry.daysSinceLastPractice,
  );

  return (
    <div
      style={{
        ...styles.popup,
        left,
        top,
        width: POPUP_W,
        borderColor: isSelf ? SELF_STROKE : NAKAMA_STROKE,
      }}
      // ポップアップ内クリックは外側キャッチャーへ伝播させない。
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-label={`${entry.name}のじょうほう`}
    >
      {/* 閉じるボタン */}
      <button
        type="button"
        style={styles.popupClose}
        onClick={onClose}
        aria-label="閉じる"
      >
        ✕
      </button>

      {/* ヘッダー（名前・称号） */}
      <div style={styles.popupHead}>
        <span style={styles.popupFlame}>
          {isSelf ? '⭐' : entry.isBurning ? '🔥' : '💤'}
        </span>
        <div style={styles.popupNameCol}>
          <div style={styles.popupNameRow}>
            <span style={styles.popupName}>{entry.name}</span>
            {entry.grade && (
              <span style={styles.gradeBadge}>{entry.grade}年</span>
            )}
            {isSelf && <span style={styles.selfBadge}>キミ</span>}
          </div>
          <div style={styles.popupTitle}>「{entry.title}」</div>
        </div>
      </div>

      {/* ステータス（コンパクトな2列グリッド） */}
      <div style={styles.popupStats}>
        <div style={styles.popupStatBox}>
          <span style={styles.popupStatLabel}>レベル</span>
          <span style={{ ...styles.popupStatBadge, backgroundColor: lvColor }}>
            Lv.{entry.level}
          </span>
        </div>
        <div style={styles.popupStatBox}>
          <span style={styles.popupStatLabel}>経験値</span>
          <span style={styles.popupStatValue}>
            {entry.total_xp.toLocaleString()}
            <span style={styles.popupStatUnit}> XP</span>
          </span>
        </div>
        <div style={styles.popupStatBox}>
          <span style={styles.popupStatLabel}>稽古日数</span>
          <span style={styles.popupStatValue}>
            {entry.total_practice_days}
            <span style={styles.popupStatUnit}> 日</span>
          </span>
        </div>
        <div style={styles.popupStatBox}>
          <span style={styles.popupStatLabel}>最後の稽古</span>
          <span style={styles.popupStatValueSmall}>{lastLabel}</span>
        </div>
      </div>

      {/* 応援ボタン（自分以外のときのみ） */}
      {!isSelf ? (
        <button
          type="button"
          onClick={onCheer}
          disabled={disabled || alreadyCheered}
          style={{
            ...styles.popupCheerBtn,
            ...(alreadyCheered ? styles.popupCheerBtnDone : {}),
            ...(cheering ? styles.cheerBtnLoading : {}),
          }}
        >
          {cheering ? (
            <span style={styles.cheerSpinner} aria-hidden="true" />
          ) : alreadyCheered ? (
            <>
              <span style={{ fontSize: '16px' }}>✅</span>
              <span>応援ずみ！</span>
            </>
          ) : (
            <>
              <span style={{ fontSize: '16px' }}>🎌</span>
              <span>応援する（+5 XP）</span>
            </>
          )}
        </button>
      ) : (
        <div style={styles.popupSelfMsg}>🔥 これがキミの現在地だ！</div>
      )}
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

        <div style={styles.skeletonGraph}>
          <div style={{ ...styles.skeletonBlock, width: '100%', height: '100%', borderRadius: 14 }} />
        </div>
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
  // 凡例＋ズームを1段に並べるトップバー
  graphTopBar: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    gap:            '8px',
    flexWrap:       'wrap',
    padding:        '0 2px',
  },
  graphLegend: {
    display:    'flex',
    gap:        '16px',
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

  // ★ ズームコントロール
  zoomBar: {
    display:         'flex',
    alignItems:      'center',
    gap:             '6px',
    padding:         '4px',
    backgroundColor: THEME.bgCardDeep,
    border:          `1px solid ${THEME.border}`,
    borderRadius:    '999px',
  },
  zoomBtn: {
    width:           '32px',
    height:          '32px',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    fontFamily:      'inherit',
    fontSize:        '20px',
    fontWeight:      900,
    lineHeight:      1,
    color:           '#FFFFFF',
    background:      `linear-gradient(180deg, ${THEME.primary} 0%, ${THEME.primaryDark} 100%)`,
    border:          `2px solid ${THEME.borderSolid}`,
    borderRadius:    '50%',
    cursor:          'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
  zoomBtnDisabled: {
    opacity: 0.4,
    cursor:  'not-allowed',
    filter:  'grayscale(0.6)',
  },
  zoomResetBtn: {
    minWidth:        '52px',
    height:          '30px',
    padding:         '0 8px',
    fontFamily:      'inherit',
    fontSize:        '12px',
    fontWeight:      900,
    color:           THEME.text,
    backgroundColor: 'transparent',
    border:          'none',
    borderRadius:    '999px',
    cursor:          'pointer',
    WebkitTapHighlightColor: 'transparent',
  },

  // スクロールビューポート
  chartScroll: {
    position:               'relative',
    width:                  '100%',
    height:                 '360px',
    WebkitOverflowScrolling: 'touch',
    borderRadius:           '10px',
  },
  graphHint: {
    textAlign:  'center',
    fontSize:   '11px',
    fontWeight: 700,
    color:      THEME.textSubtle,
    padding:    '0 8px',
    lineHeight: 1.5,
  },

  // ★ インラインポップアップ
  popupCatcher: {
    position: 'absolute',
    inset:    0,
    zIndex:   10,
    // 透明だがクリックは拾う（外側タップで閉じる用）。
    background: 'transparent',
  },
  popup: {
    position:        'absolute',
    zIndex:          20,
    padding:         '12px 12px 12px',
    backgroundColor: THEME.bgCard,
    border:          `2px solid ${THEME.borderSolid}`,
    borderRadius:    '14px',
    boxShadow:       '0 10px 30px rgba(0,0,0,0.6)',
    animation:       'nakama_popup_in 0.18s cubic-bezier(0.2,0.8,0.3,1.2) both',
  },
  popupClose: {
    position:        'absolute',
    top:             '6px',
    right:           '6px',
    width:           '24px',
    height:          '24px',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    fontSize:        '12px',
    fontWeight:      900,
    color:           THEME.textMuted,
    backgroundColor: THEME.bgCardDeep,
    border:          `1px solid ${THEME.border}`,
    borderRadius:    '50%',
    cursor:          'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
  popupHead: {
    display:      'flex',
    alignItems:   'center',
    gap:          '8px',
    paddingRight: '22px', // 閉じるボタンと被らないよう余白
    marginBottom: '10px',
  },
  popupFlame: {
    fontSize:   '26px',
    flexShrink: 0,
    animation:  'nakama_flame_flicker 1.1s ease-in-out infinite',
  },
  popupNameCol: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '2px',
    minWidth:      0,
  },
  popupNameRow: {
    display:    'flex',
    alignItems: 'center',
    gap:        '5px',
    flexWrap:   'wrap',
  },
  popupName: {
    fontSize:   '16px',
    fontWeight: 900,
    color:      THEME.text,
  },
  popupTitle: {
    fontSize:     '11px',
    fontWeight:   700,
    color:        THEME.accent,
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
  selfBadge: {
    fontSize:     '9px',
    fontWeight:   900,
    color:        '#1A0000',
    padding:      '1px 7px',
    background:   'linear-gradient(180deg, #FFF7C0 0%, #FFD700 100%)',
    borderRadius: '999px',
    boxShadow:    '0 0 6px rgba(255,215,0,0.7)',
    flexShrink:   0,
  },
  popupStats: {
    display:             'grid',
    gridTemplateColumns: '1fr 1fr',
    gap:                 '6px',
    marginBottom:        '10px',
  },
  popupStatBox: {
    display:         'flex',
    flexDirection:   'column',
    alignItems:      'center',
    gap:             '3px',
    padding:         '7px 4px',
    backgroundColor: THEME.bgCardDeep,
    border:          `1px solid ${THEME.border}`,
    borderRadius:    '8px',
  },
  popupStatLabel: {
    fontSize:   '9px',
    fontWeight: 700,
    color:      THEME.textSubtle,
  },
  popupStatValue: {
    fontSize:   '14px',
    fontWeight: 900,
    color:      THEME.text,
  },
  popupStatValueSmall: {
    fontSize:   '11px',
    fontWeight: 900,
    color:      THEME.text,
    textAlign:  'center',
  },
  popupStatBadge: {
    fontSize:     '12px',
    fontWeight:   900,
    color:        '#1A0000',
    padding:      '2px 10px',
    borderRadius: '6px',
    textShadow:   '0 1px 0 rgba(255,255,255,0.25)',
  },
  popupStatUnit: {
    fontSize:   '10px',
    fontWeight: 700,
    color:      THEME.textMuted,
  },
  popupCheerBtn: {
    width:           '100%',
    minHeight:       '42px',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             '6px',
    fontFamily:      'inherit',
    fontSize:        '13px',
    fontWeight:      900,
    color:           '#FFFFFF',
    background:      `linear-gradient(180deg, #FF5555 0%, ${THEME.primary} 50%, ${THEME.primaryDark} 100%)`,
    border:          `2px solid ${THEME.borderSolid}`,
    borderRadius:    '10px',
    cursor:          'pointer',
    boxShadow:       '0 3px 10px rgba(255,68,68,0.4)',
    WebkitTapHighlightColor: 'transparent',
  },
  popupCheerBtnDone: {
    background: THEME.bgCardDeep,
    border:     `2px solid ${THEME.border}`,
    boxShadow:  'none',
    cursor:     'default',
    color:      THEME.textSubtle,
  },
  popupSelfMsg: {
    textAlign:       'center',
    fontSize:        '12px',
    fontWeight:      700,
    color:           SELF_COLOR,
    padding:         '9px',
    backgroundColor: THEME.bgCardDeep,
    border:          `1px solid ${SELF_COLOR}`,
    borderRadius:    '10px',
  },

  // 共通スピナー（応援中）
  cheerBtnLoading: {
    opacity: 0.8,
    cursor:  'wait',
  },
  cheerSpinner: {
    width:          '18px',
    height:         '18px',
    border:         '3px solid rgba(255,255,255,0.3)',
    borderTopColor: '#FFFFFF',
    borderRadius:   '50%',
    animation:      'nakama_spin 0.7s linear infinite',
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
