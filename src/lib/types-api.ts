// src/lib/types-api.ts
// =====================================================================
// 燃えろ剣士 - API専用の型定義・定数
// -------------------------------------------------------------------
// ★ Server Actions ('use server') ファイルは async 関数しか export できない
//   という Next.js の制約があるため、API レスポンス型・ペイロード型・定数は
//   この中立ファイルへ退避する。actions.ts / api.ts の双方からインポートする。
// =====================================================================

import type { MinigameRank } from '@/types';

// =====================================================================
// 全体評価（Phase 5）
// =====================================================================

/**
 * 全体評価（一括評価）リクエストの型定義
 */
export interface BulkEvalPayload {
  /** 評価対象の生徒IDの配列（チェックボックスで選択された生徒） */
  student_ids: string[];
  /** 評価対象日（YYYY-MM-DD）。未指定の場合は当日として扱う（カレンダーからの遡り評価に対応） */
  date?: string;
  /** 課題ごとの評価（全選択生徒に同じ評価を一括適用） */
  evaluations: Array<{
    task_id: string;
    score: number; // 1〜5
    comment?: string; // 任意（30文字以内）
  }>;
}

/**
 * 全体評価レスポンスの型定義
 */
export interface BulkEvalResponse {
  /** 処理が成功した生徒数 */
  processed_count: number;
  /** 失敗した生徒数 */
  failed_count: number;
  /** 失敗した生徒の詳細（エラー理由） */
  failures: Array<{
    student_id: string;
    reason: string;
  }>;
  /** 各生徒に付与した経験値の合計 */
  total_xp_granted: number;
  /** 1人あたりに付与した経験値（参考表示用） */
  xp_per_student: number;
  /** 1件の評価あたりのXP倍率（5倍） */
  multiplier: number;
  /** 評価された課題数 */
  evaluated_count: number;
  /** 生徒ごとの評価結果サマリ */
  results: Array<{
    student_id: string;
    student_name: string;
    xp_granted: number;
    new_total_xp: number;
    new_level: number;
    skipped_count: number; // 二重評価でスキップされた件数
  }>;
}

// =====================================================================
// ミニゲーム（Phase 6 / 6.1 / 6.2）
// =====================================================================

/**
 * 本日のプレイ状況レスポンス（getMinigameStatus）
 */
export interface MinigameStatus {
  /** 本日プレイ済み回数（0〜5） */
  todayPlayed: number;
  /** 1日の上限（5） */
  dailyLimit: number;
  /** 残りプレイ可能数 */
  remaining: number;
  /** 上限到達でロックされているか */
  locked: boolean;
  /** 自己ベスト平均反応速度（ms）。記録なしは null */
  bestTimeMs: number | null;
}

/**
 * 試合結果保存レスポンス（saveMinigameResult）
 */
export interface MinigameSaveResult {
  saved: true;
  /** 今回の獲得経験値 */
  earnedXp: number;
  /** 保存後の総経験値 */
  totalXp: number;
  /** 保存後のレベル */
  level: number;
  /** レベルアップしたか */
  leveledUp: boolean;
  /** 保存後の本日プレイ回数 */
  todayPlayed: number;
  /** 残りプレイ可能数 */
  remaining: number;
  /** 上限到達でロックか */
  locked: boolean;
  /** 平均反応速度（ms） */
  averageTime: number;
  /** 総合ランク */
  rank: string;
}

/**
 * ランキング1件分（topBest / topAverage 共通）
 * ★ Phase 6.2: bestTimeMs は「その指標での代表タイム(ms)」を表す。
 *   - topBest    … そのユーザーの全プレイ中の最速タイム（最小値）
 *   - topAverage … そのユーザーの全プレイの平均タイム（合計÷回数）
 *   既存フロント（formatTime 等）との互換のためフィールド名は bestTimeMs を維持する。
 */
export interface MinigameRankingEntry {
  /** 生徒ID */
  userId: string;
  /** 生徒名 */
  name: string;
  /** 代表タイム（ms・小さいほど速い） */
  bestTimeMs: number;
  /** ★ Phase 6.2: このユーザーの有効プレイ回数（0以下を除外した件数・参考表示用） */
  playCount: number;
}

/**
 * ★ Phase 6.1: 推移グラフ用の1系列（1人分のタイム推移）
 */
export interface MinigameRankingSeries {
  /** 生徒ID */
  userId: string;
  /** 生徒名（グラフの凡例に使用） */
  name: string;
  /** 各日のベストタイム(ms)。記録がない日は null */
  points: Array<number | null>;
}

/**
 * ★ Phase 6.2: ランキングAPIのレスポンス全体
 *   平均タイム/最速タイムのタブ切替に対応するため、
 *   従来の単一 top を topBest / topAverage の2系列へ拡張した。
 */
export interface MinigameRankingResponse {
  /** ★ 最速タイム上位（average_time の最小値・昇順／最大10名） */
  topBest: MinigameRankingEntry[];
  /** ★ 平均タイム上位（average_time の平均値・昇順／最大10名） */
  topAverage: MinigameRankingEntry[];
  /** 推移グラフ用データ（最速タイム上位プレイヤー基準） */
  history: {
    /** 日付ラベル（"MM-dd"・古い→新しい） */
    dates: string[];
    /** 上位プレイヤーごとのタイム推移 */
    series: MinigameRankingSeries[];
  };
}

// =====================================================================
// あいことば変更（Phase 7）
// =====================================================================

/**
 * あいことば変更レスポンスの型定義
 */
export interface UpdatePasscodeResponse {
  /** 更新が成功したか */
  updated: boolean;
  /** 対象ユーザーID */
  user_id: string;
  /** 対象ユーザー名 */
  name: string;
  /** メッセージ */
  message: string;
}

/**
 * 課題マスター更新の結果
 */
export interface UpdateTasksResult {
  updated: boolean;
  count: number;
  message: string;
}

// =====================================================================
// なかま機能（Phase 8）
// =====================================================================

/**
 * なかま1人分のエントリ
 * ★ プライバシー保護のため、公開するのは
 * 名前 / 称号 / レベル / 合計XP / 最終稽古日 のみ。
 * 自己評価・先生評価・コメント・弱点等は一切含めない。
 */
export interface NakamaEntry {
  user_id: string;
  name: string;
  grade?: string;
  level: number;
  total_xp: number;
  title: string; // 称号（titleForLevel で導出）
  last_practice_date: string | null;
  /** 何日前に稽古したか（燃え盛り判定用・null は記録なし） */
  daysSinceLastPractice: number | null;
  /** 最終稽古日から3日以内なら true（燃えているアピール用） */
  isBurning: boolean;
  /** 本日、自分がこのなかまを既に応援済みか（1日1回制限用） */
  cheeredTodayByMe: boolean;
}

/**
 * なかま一覧レスポンス
 */
export interface NakamaListResponse {
  /** 自分以外の門下生一覧（合計XP降順） */
  nakama: NakamaEntry[];
  /** 自分が本日応援した人数（参考表示用） */
  cheeredToday: number;
}

/**
 * 応援アクションのレスポンス
 */
export interface CheerResponse {
  /** 応援が成立したか */
  cheered: boolean;
  /** 応援した相手のID */
  to_user_id: string;
  /** 応援した相手の名前 */
  to_user_name: string;
  /** 自分（応援した側）が得たXP */
  my_xp_gained: number;
  /** 相手（応援された側）が得たXP */
  their_xp_gained: number;
  /** 1回の応援で付与されるXP（5固定） */
  cheer_xp: number;
  /** メッセージ（成功・スキップ理由など） */
  message: string;
}

// =====================================================================
// MinigameRank の再エクスポート（フロントの利便性のため）
// =====================================================================
export type { MinigameRank };
