// src/lib/api.ts
// =====================================================================
// 燃えろ剣士 - GAS APIクライアント & SWRフック
// Phase 5: 全体評価（一括評価）API追加
// Phase 6: ミニゲーム『刹那ノ見切』API追加
// =====================================================================

import useSWR, { SWRConfiguration, SWRResponse } from 'swr';
import { getAuthUser } from './auth';
import type {
  User,
  DashboardData,
  TeacherDashboardData,
  StudentDetailData,
  SaveLogPayload,
  SaveLogResponse,
  TeacherEvalPayload,
  TeacherEvalResponse,
  GASResponse,
} from '@/types';

// =====================================================================
// GAS エンドポイント（環境変数）
// =====================================================================
const GAS_URL = process.env.NEXT_PUBLIC_GAS_URL || '';

if (!GAS_URL && typeof window !== 'undefined') {
  console.error('[api] NEXT_PUBLIC_GAS_URL が設定されていません');
}

// =====================================================================
// 共通: GAS への GET リクエスト
// =====================================================================
export async function gasGet<T>(
  action: string,
  params: Record<string, string> = {},
): Promise<T> {
  const query = new URLSearchParams({ action, ...params }).toString();
  const res = await fetch(`${GAS_URL}?${query}`, {
    method: 'GET',
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`通信エラー: ${res.status}`);
  }
  const json = (await res.json()) as GASResponse<T>;
  if (json.status !== 'ok' || json.data === undefined) {
    throw new Error(json.message || 'サーバーエラー');
  }
  return json.data;
}

// =====================================================================
// 共通: GAS への POST リクエスト
// CORS制約のため text/plain で送信（GAS側はJSON.parse対応）
// =====================================================================
export async function gasPost<T>(
  payload: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(GAS_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body:    JSON.stringify(payload),
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`通信エラー: ${res.status}`);
  }
  const json = (await res.json()) as GASResponse<T>;
  if (json.status !== 'ok' || json.data === undefined) {
    throw new Error(json.message || 'サーバーエラー');
  }
  return json.data;
}

// =====================================================================
// 認証API
// =====================================================================
export async function loginUser(
  userId: string,
  passcode: string,
): Promise<User> {
  return gasPost<User>({
    action:   'login',
    user_id:  userId,
    passcode: passcode,
  });
}

// =====================================================================
// 公開API: ユーザー一覧取得（ログイン画面のドロップダウン用）
// =====================================================================
import type { UserListResponse } from '@/types';

export async function fetchUserList(): Promise<UserListResponse> {
  return gasGet<UserListResponse>('getUserList');
}

// SWRフック版（5分キャッシュ・複数ログイン試行に有効）
export function useUserListSWR() {
  return useSWR<UserListResponse, Error>(
    'gas:getUserList',
    fetchUserList,
    {
      ...SWR_BASE_CONFIG,
      dedupingInterval: SWR_DEDUP.MASTER,
    },
  );
}

// =====================================================================
// 更新系API（Mutation）
// =====================================================================
export async function saveLogApi(
  payload: Omit<SaveLogPayload, 'action'> & { user_id: string },
): Promise<SaveLogResponse> {
  return gasPost<SaveLogResponse>({
    action: 'saveLog',
    ...payload,
  });
}

// ★ record/page.tsx から呼びやすい便利ラッパー
//    ログインユーザーを内部で取得してuser_idを自動付与する
export async function saveLog(
  payload: SaveLogPayload,
): Promise<SaveLogResponse> {
  const me = getAuthUser();
  if (!me || me.role !== 'student') {
    throw new Error('ログインしていません');
  }
  // payload から action を取り除いて saveLogApi に渡す
  const { action: _action, ...rest } = payload;
  return saveLogApi({
    ...rest,
    user_id: me.id,
  });
}

export async function evaluateStudentApi(
  payload: Omit<TeacherEvalPayload, 'action'> & { teacher_id: string },
): Promise<TeacherEvalResponse> {
  return gasPost<TeacherEvalResponse>({
    action: 'evaluateStudent',
    ...payload,
  });
}

// ★ 先生画面から呼びやすい便利ラッパー（個別評価）
export async function evaluateStudent(
  payload: TeacherEvalPayload,
): Promise<TeacherEvalResponse> {
  const me = getAuthUser();
  if (!me || me.role !== 'teacher') {
    throw new Error('先生としてログインしていません');
  }
  const { action: _action, ...rest } = payload;
  return evaluateStudentApi({
    ...rest,
    teacher_id: me.id,
  });
}

// =====================================================================
// ★★★ Phase 5 追加: 全体評価（一括評価）API ★★★
// =====================================================================

/**
 * 全体評価（一括評価）リクエストの型定義
 */
export interface BulkEvalPayload {
  /** 評価対象の生徒IDの配列（チェックボックスで選択された生徒） */
  student_ids: string[];
  /** 課題ごとの評価（全選択生徒に同じ評価を一括適用） */
  evaluations: Array<{
    task_id: string;
    score:   number;       // 1〜5
    comment?: string;      // 任意（30文字以内）
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
    reason:     string;
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
    student_id:    string;
    student_name:  string;
    xp_granted:    number;
    new_total_xp:  number;
    new_level:     number;
    skipped_count: number;     // 二重評価でスキップされた件数
  }>;
}

/**
 * 内部API: GASに対して bulk-evaluate を投げる
 */
export async function evaluateBulkStudentsApi(
  payload: BulkEvalPayload & { teacher_id: string },
): Promise<BulkEvalResponse> {
  return gasPost<BulkEvalResponse>({
    action: 'evaluateBulkStudents',
    ...payload,
  });
}

/**
 * 公開ラッパー: 全体評価ページから呼びやすい関数
 * ログイン中の先生IDを内部で自動付与する
 *
 * 例:
 *   await evaluateBulkStudents({
 *     student_ids: ['U001', 'U002'],
 *     evaluations: [
 *       { task_id: 'K001', score: 5 },
 *       { task_id: 'K002', score: 4, comment: 'よくがんばった' },
 *     ],
 *   });
 */
export async function evaluateBulkStudents(
  payload: BulkEvalPayload,
): Promise<BulkEvalResponse> {
  const me = getAuthUser();
  if (!me || me.role !== 'teacher') {
    throw new Error('先生としてログインしていません');
  }

  // 入力バリデーション（早期失敗で無駄な通信を防ぐ）
  if (!Array.isArray(payload.student_ids) || payload.student_ids.length === 0) {
    throw new Error('評価する生徒を1人以上選択してください');
  }
  if (!Array.isArray(payload.evaluations) || payload.evaluations.length === 0) {
    throw new Error('評価する課題を1つ以上選んでください');
  }

  // 重複student_idを除去
  const uniqueIds = Array.from(new Set(payload.student_ids));

  return evaluateBulkStudentsApi({
    teacher_id:  me.id,
    student_ids: uniqueIds,
    evaluations: payload.evaluations,
  });
}

// =====================================================================
// SWR 共通設定（4層キャッシュ戦略の中核）
// =====================================================================
export const SWR_BASE_CONFIG: SWRConfiguration = {
  // 永続化キャッシュがあれば即時表示・再検証はバックグラウンドのみ
  revalidateIfStale:    false,
  revalidateOnFocus:    false,
  revalidateOnReconnect: true,
  keepPreviousData:     true,
  errorRetryCount:      2,
  errorRetryInterval:   3000,
  shouldRetryOnError:   true,
};

// カテゴリ別の dedupingInterval（同一キーを短時間に何度も叩かない設定）
export const SWR_DEDUP = {
  // ダッシュボード系：5秒（直後の連打のみ抑制）
  DASHBOARD:    5_000,
  // 先生一覧系：10秒（学級が大きいので少し長め）
  TEACHER_LIST: 10_000,
  // 生徒詳細：3秒（先生は連続して見ることが多い）
  STUDENT_DETAIL: 3_000,
  // マスターデータ系：5分（ほぼ変わらない）
  MASTER:       300_000,
} as const;

// =====================================================================
// SWR キー生成（ログインユーザーIDを含めて衝突防止）
// =====================================================================
function buildKey(action: string, params: Record<string, string>): string {
  const sorted = Object.keys(params).sort()
    .map(k => `${k}=${params[k]}`).join('&');
  return `gas:${action}?${sorted}`;
}

// =====================================================================
// SWRフック: 生徒ダッシュボード
// =====================================================================
export function useDashboardSWR(
  userId: string | null | undefined,
): SWRResponse<DashboardData, Error> {
  const key = userId ? buildKey('getDashboard', { user_id: userId }) : null;

  return useSWR<DashboardData, Error>(
    key,
    async () => gasGet<DashboardData>('getDashboard', { user_id: userId! }),
    {
      ...SWR_BASE_CONFIG,
      dedupingInterval: SWR_DEDUP.DASHBOARD,
    },
  );
}

// =====================================================================
// SWRフック: 先生ダッシュボード（門下生一覧）
// =====================================================================
export function useTeacherDashboardSWR(
  teacherId: string | null | undefined,
): SWRResponse<TeacherDashboardData, Error> {
  const key = teacherId
    ? buildKey('getTeacherDashboard', { teacher_id: teacherId })
    : null;

  return useSWR<TeacherDashboardData, Error>(
    key,
    async () => gasGet<TeacherDashboardData>('getTeacherDashboard', {
      teacher_id: teacherId!,
    }),
    {
      ...SWR_BASE_CONFIG,
      dedupingInterval: SWR_DEDUP.TEACHER_LIST,
    },
  );
}

// =====================================================================
// SWRフック: 生徒詳細（先生が個別生徒画面を開いた際）
// =====================================================================
export function useStudentDetailSWR(
  teacherId: string | null | undefined,
  studentId: string | null | undefined,
): SWRResponse<StudentDetailData, Error> {
  const key = (teacherId && studentId)
    ? buildKey('getStudentDetail', {
        teacher_id: teacherId,
        student_id: studentId,
      })
    : null;

  return useSWR<StudentDetailData, Error>(
    key,
    async () => gasGet<StudentDetailData>('getStudentDetail', {
      teacher_id: teacherId!,
      student_id: studentId!,
    }),
    {
      ...SWR_BASE_CONFIG,
      dedupingInterval: SWR_DEDUP.STUDENT_DETAIL,
    },
  );
}

// =====================================================================
// 便利フック: 現在ログイン中のユーザーのダッシュボードを自動取得
// =====================================================================
export function useMyDashboardSWR() {
  const me = typeof window !== 'undefined' ? getAuthUser() : null;
  return useDashboardSWR(me?.role === 'student' ? me.id : null);
}

export function useMyTeacherDashboardSWR() {
  const me = typeof window !== 'undefined' ? getAuthUser() : null;
  return useTeacherDashboardSWR(me?.role === 'teacher' ? me.id : null);
}

// =====================================================================
// SWR キー無効化ヘルパー
// 更新系API実行後の手動revalidate用
// =====================================================================
export const SWR_KEYS = {
  dashboard:        (userId: string) => buildKey('getDashboard', { user_id: userId }),
  teacherDashboard: (teacherId: string) =>
    buildKey('getTeacherDashboard', { teacher_id: teacherId }),
  studentDetail: (teacherId: string, studentId: string) =>
    buildKey('getStudentDetail', { teacher_id: teacherId, student_id: studentId }),
} as const;

// =====================================================================
// ★★★ Phase 6 追加: ミニゲーム『刹那ノ見切』API ★★★
// =====================================================================

/**
 * ミニゲームのランク（フロント・GAS共通）
 */
export type MinigameRank = 'S' | 'A' | 'B' | 'C' | 'F';

/**
 * 本日のプレイ状況レスポンス（getMinigameStatus）
 */
export interface MinigameStatus {
  /** 本日プレイ済み回数（0〜3） */
  todayPlayed: number;
  /** 1日の上限（3） */
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
  saved:       true;
  /** 今回の獲得経験値 */
  earnedXp:    number;
  /** 保存後の総経験値 */
  totalXp:     number;
  /** 保存後のレベル */
  level:       number;
  /** レベルアップしたか */
  leveledUp:   boolean;
  /** 保存後の本日プレイ回数 */
  todayPlayed: number;
  /** 残りプレイ可能数 */
  remaining:   number;
  /** 上限到達でロックか */
  locked:      boolean;
  /** 平均反応速度（ms） */
  averageTime: number;
  /** 総合ランク */
  rank:        string;
}

/**
 * 内部API: 本日のプレイ状況を取得（GET）
 */
export async function fetchMinigameStatusApi(
  userId: string,
): Promise<MinigameStatus> {
  return gasGet<MinigameStatus>('getMinigameStatus', { user_id: userId });
}

/**
 * 公開ラッパー: ログイン中の生徒IDを内部で付与してプレイ状況を取得
 * ミニゲーム画面の初期化時に呼ぶ。
 */
export async function fetchMinigameStatus(): Promise<MinigameStatus> {
  const me = getAuthUser();
  if (!me || me.role !== 'student') {
    throw new Error('門下生としてログインしていません');
  }
  return fetchMinigameStatusApi(me.id);
}

/**
 * 内部API: 試合結果を保存（POST）
 */
export async function saveMinigameResultApi(
  payload: {
    user_id:     string;
    averageTime: number;
    rank:        MinigameRank;
  },
): Promise<MinigameSaveResult> {
  return gasPost<MinigameSaveResult>({
    action:      'saveMinigameResult',
    ...payload,
  });
}

/**
 * 公開ラッパー: ログイン中の生徒IDを内部で付与して試合結果を保存
 * 1試合（3本）終了時に呼ぶ。ランクに応じたXPが付与される。
 */
export async function saveMinigameResult(
  payload: {
    averageTime: number;
    rank:        MinigameRank;
  },
): Promise<MinigameSaveResult> {
  const me = getAuthUser();
  if (!me || me.role !== 'student') {
    throw new Error('門下生としてログインしていません');
  }

  // 軽い入力ガード
  const avg = Number(payload.averageTime);
  if (!Number.isFinite(avg) || avg < 0) {
    throw new Error('平均反応時間が不正です');
  }
  const validRanks: MinigameRank[] = ['S', 'A', 'B', 'C', 'F'];
  if (!validRanks.includes(payload.rank)) {
    throw new Error('ランクが不正です');
  }

  return saveMinigameResultApi({
    user_id:     me.id,
    averageTime: Math.round(avg),
    rank:        payload.rank,
  });
}

// =====================================================================
// SWRフック: ミニゲームのプレイ状況（任意・5秒キャッシュ）
// =====================================================================
export function useMinigameStatusSWR() {
  const me = typeof window !== 'undefined' ? getAuthUser() : null;
  const key = me?.role === 'student'
    ? buildKey('getMinigameStatus', { user_id: me.id })
    : null;

  return useSWR<MinigameStatus, Error>(
    key,
    async () => gasGet<MinigameStatus>('getMinigameStatus', { user_id: me!.id }),
    {
      ...SWR_BASE_CONFIG,
      dedupingInterval: SWR_DEDUP.DASHBOARD,
    },
  );
}
