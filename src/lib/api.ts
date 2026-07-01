// src/lib/api.ts
'use client';
// =====================================================================
// 燃えろ剣士 - クライアント側 API 層（SWRフック＋公開ラッパー）
// =====================================================================
// ★ リファクタリング方針:
//   DB へ直接アクセスする処理はすべて actions.ts（'use server'・
//   Service Role Key）へ移動した。このファイルはクライアント側で動く
//   SWR フックと、認証チェック付きの公開ラッパーのみを担う。
//
//   ・supabase クライアント（anon key）はこのファイルから完全撤廃。
//   ・fetcher は actions.ts の Server Action 関数をそのまま呼ぶ。
//   ・getAuthUser はクライアント側のログイン状態判定に引き続き使用。
// =====================================================================

import useSWR, { SWRConfiguration, SWRResponse } from 'swr';
import { getAuthUser } from './auth';
import type {
  DashboardData,
  TeacherDashboardData,
  StudentDetailData,
  SaveLogPayload,
  SaveLogResponse,
  TeacherEvalPayload,
  TeacherEvalResponse,
  UserListResponse,
  MinigameRank,
} from '@/types';
import type {
  BulkEvalPayload,
  BulkEvalResponse,
  MinigameStatus,
  MinigameSaveResult,
  MinigameRankingResponse,
  UpdatePasscodeResponse,
  UpdateTasksResult,
  NakamaListResponse,
  CheerResponse,
} from './types-api';

// ★ サーバーアクション（DB通信の実体）をインポートして fetcher に使う。
import {
  loginUser as loginUserAction,
  fetchUserList as fetchUserListAction,
  saveLogApi,
  evaluateStudentApi,
  evaluateBulkStudentsApi,
  fetchDashboard as fetchDashboardAction,
  fetchTeacherDashboard as fetchTeacherDashboardAction,
  fetchStudentDetail as fetchStudentDetailAction,
  fetchEvaluatedTaskIdsByDate as fetchEvaluatedTaskIdsByDateAction,
  fetchEvaluatedStudentIdsByDate as fetchEvaluatedStudentIdsByDateAction,
  fetchMinigameStatusApi,
  saveMinigameResultApi,
  fetchMinigameRanking as fetchMinigameRankingAction,
  updateUserPasscodeApi,
  updateTasksApi,
  fetchNakamaListApi,
  cheerStudentApi,
} from './actions';

// =====================================================================
// 型・定数の再エクスポート（既存 import 互換のため）
// -------------------------------------------------------------------
// 旧 api.ts は型・定数も多数 export していたため、それらを参照している
// 既存コードが壊れないよう、types-api.ts の内容をそのまま再エクスポートする。
// =====================================================================
export type {
  BulkEvalPayload,
  BulkEvalResponse,
  MinigameStatus,
  MinigameSaveResult,
  MinigameRankingEntry,
  MinigameRankingSeries,
  MinigameRankingResponse,
  UpdatePasscodeResponse,
  UpdateTasksResult,
  NakamaEntry,
  NakamaListResponse,
  CheerResponse,
  MinigameRank,
} from './types-api';

// =====================================================================
// 認証系の公開ラッパー（Server Action を呼ぶだけの薄いラッパー）
// =====================================================================

/**
 * ログイン（id + passcode 照合）。
 * 旧 api.ts と同名・同シグネチャを維持する。
 */
export async function loginUser(
  userId: string,
  passcode: string,
) {
  return loginUserAction(userId, passcode);
}

/**
 * ユーザー一覧取得（ログイン画面のドロップダウン用）。
 */
export async function fetchUserList(): Promise<UserListResponse> {
  return fetchUserListAction();
}

// =====================================================================
// 更新系 公開ラッパー
// =====================================================================

/**
 * ★ record/page.tsx から呼びやすい便利ラッパー
 *    ログインユーザーを内部で取得して user_id を自動付与する。
 */
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

/**
 * ★ 互換用エイリアス: 課題ログのみを保存したい画面向け
 *   既存インターフェース saveTaskLog を維持（内部は saveLog に委譲）。
 */
export async function saveTaskLog(
  payload: {
    date: string;
    taskEvals: Array<{ task_id: string; score: number }>;
  },
): Promise<SaveLogResponse> {
  return saveLog({
    action: 'saveLog',
    date: payload.date,
    taskEvals: payload.taskEvals,
  });
}

/**
 * ★ 先生画面から呼びやすい便利ラッパー（個別評価）。
 */
export async function evaluateStudent(
  payload: TeacherEvalPayload,
): Promise<TeacherEvalResponse> {
  const me = getAuthUser();
  if (!me || me.role !== 'teacher') {
    throw new Error('先生としてログインしていません');
  }
  // action のみ除去し、date を含む残りのフィールドをそのまま内部APIへ渡す。
  // （date が undefined なら当日、YYYY-MM-DD ならカレンダーからの遡り評価）
  const { action: _action, ...rest } = payload;
  return evaluateStudentApi({
    ...rest,
    teacher_id: me.id,
  });
}

/**
 * 公開ラッパー: 全体評価ページから呼びやすい関数。
 * ログイン中の先生IDを内部で自動付与する。
 *
 * 例:
 * await evaluateBulkStudents({
 *   student_ids: ['U001', 'U002'],
 *   evaluations: [
 *     { task_id: 'K001', score: 5 },
 *     { task_id: 'K002', score: 4, comment: 'よくがんばった' },
 *   ],
 * });
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

  // ★ date を内部APIへ引き渡す（undefined なら当日、YYYY-MM-DD なら遡り評価）。
  return evaluateBulkStudentsApi({
    teacher_id: me.id,
    student_ids: uniqueIds,
    date: payload.date,
    evaluations: payload.evaluations,
  });
}

/**
 * 公開ラッパー: あいことばを変更する。
 * - 設定画面から呼びやすいシンプルな関数。
 * - userId を明示的に渡す版（ログイン情報に依存しすぎない設計）。
 * - 入力ガードを行ってから送信する。
 *
 * 例:
 * await updateUserPasscode('U001', '5678');
 */
export async function updateUserPasscode(
  userId: string,
  newPasscode: string,
): Promise<UpdatePasscodeResponse> {
  // 軽い入力ガード（無駄な通信を防ぐ）
  const id = (userId || '').trim();
  const next = (newPasscode || '').trim();

  if (!id) {
    throw new Error('ログイン情報が見つかりません');
  }
  if (!next) {
    throw new Error('新しいあいことばを入力してください');
  }
  if (next.length < 1 || next.length > 20) {
    throw new Error('あいことばは1〜20文字で入力してください');
  }

  return updateUserPasscodeApi({
    user_id: id,
    new_passcode: next,
  });
}

/**
 * 先生用: 課題マスター（task_master）の更新ラッパー。
 * 子供向け仕様では生徒は課題を作れないため、生徒呼び出しは no-op とする。
 * 既存インターフェース updateTasks を維持しつつ Server Action へ委譲。
 */
export async function updateTasks(
  tasks: Array<{
    id: string;
    task_text: string;
    display_order: number;
    grade_min: number;
  }>,
): Promise<UpdateTasksResult> {
  const me = getAuthUser();

  // 生徒は課題を編集できない仕様 → no-op で安全に返す
  if (!me || me.role !== 'teacher') {
    return {
      updated: false,
      count: 0,
      message: '課題の編集は先生のみ可能です',
    };
  }

  // 実体は Server Action へ委譲（DB 更新はサーバー側で実行）。
  return updateTasksApi(tasks);
}

/**
 * 公開ラッパー: ログイン中の生徒IDを内部で付与して試合結果を保存。
 * 1試合（3本）終了時に呼ぶ。ランクに応じたXPが付与される。
 */
export async function saveMinigameResult(
  payload: {
    averageTime: number;
    rank: MinigameRank;
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
    user_id: me.id,
    averageTime: Math.round(avg),
    rank: payload.rank,
  });
}

/**
 * 公開ラッパー: ログイン中の生徒IDを内部で付与してプレイ状況を取得。
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
 * 公開API: 道場内ランキングを取得（誰でも閲覧可能）。
 */
export async function fetchMinigameRanking(): Promise<MinigameRankingResponse> {
  return fetchMinigameRankingAction();
}

/**
 * 公開ラッパー: ログイン中の生徒IDを内部で付与してなかま一覧を取得。
 */
export async function fetchNakamaList(): Promise<NakamaListResponse> {
  const me = getAuthUser();
  if (!me || me.role !== 'student') {
    throw new Error('門下生としてログインしていません');
  }
  return fetchNakamaListApi(me.id);
}

/**
 * 公開ラッパー: ログイン中の生徒IDを内部で付与して応援を実行する。
 *
 * 例:
 * await cheerStudent('U002');
 */
export async function cheerStudent(
  toUserId: string,
): Promise<CheerResponse> {
  const me = getAuthUser();
  if (!me || me.role !== 'student') {
    throw new Error('門下生としてログインしていません');
  }
  const target = (toUserId || '').trim();
  if (!target) {
    throw new Error('応援する相手が指定されていません');
  }
  return cheerStudentApi({
    from_user_id: me.id,
    to_user_id: target,
  });
}

// =====================================================================
// SWR 共通設定（4層キャッシュ戦略の中核）
// =====================================================================
export const SWR_BASE_CONFIG: SWRConfiguration = {
  // 永続化キャッシュがあれば即時表示・再検証はバックグラウンドのみ
  revalidateIfStale: false,
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  keepPreviousData: true,
  errorRetryCount: 2,
  errorRetryInterval: 3000,
  shouldRetryOnError: true,
};

// カテゴリ別の dedupingInterval（同一キーを短時間に何度も叩かない設定）
export const SWR_DEDUP = {
  // ダッシュボード系：5秒（直後の連打のみ抑制）
  DASHBOARD: 5_000,
  // 先生一覧系：10秒（学級が大きいので少し長め）
  TEACHER_LIST: 10_000,
  // 生徒詳細：3秒（先生は連続して見ることが多い）
  STUDENT_DETAIL: 3_000,
  // マスターデータ系：5分（ほぼ変わらない）
  MASTER: 300_000,
} as const;

// =====================================================================
// SWR キー生成（ログインユーザーIDを含めて衝突防止）
// =====================================================================
function buildKey(action: string, params: Record<string, string>): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return `gas:${action}?${sorted}`;
}

// =====================================================================
// SWRフック: ユーザー一覧（5分キャッシュ・複数ログイン試行に有効）
// =====================================================================
export function useUserListSWR() {
  return useSWR<UserListResponse, Error>(
    'supabase:getUserList',
    fetchUserListAction,
    {
      ...SWR_BASE_CONFIG,
      dedupingInterval: SWR_DEDUP.MASTER,
    },
  );
}

// =====================================================================
// SWRフック: 生徒ダッシュボード（fetchDashboard を使用）
// =====================================================================
export function useDashboardSWR(
  userId: string | null | undefined,
): SWRResponse<DashboardData, Error> {
  const key = userId ? buildKey('getDashboard', { user_id: userId }) : null;

  return useSWR<DashboardData, Error>(
    key,
    async () => fetchDashboardAction(userId!),
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
    async () => fetchTeacherDashboardAction(teacherId!),
    {
      ...SWR_BASE_CONFIG,
      dedupingInterval: SWR_DEDUP.TEACHER_LIST,
    },
  );
}

// =====================================================================
// SWRフック: 指定日の評価済みタスクID（個別評価画面用）
// key に date を含めるため、日付変更で自動再取得される。
// =====================================================================
export function useEvaluatedTaskIdsByDateSWR(
  teacherId: string | null | undefined,
  studentId: string | null | undefined,
  date: string | null | undefined,
): SWRResponse<string[], Error> {
  const key =
    teacherId && studentId && date
      ? buildKey('getEvaluatedTaskIdsByDate', {
          teacher_id: teacherId,
          student_id: studentId,
          date,
        })
      : null;

  return useSWR<string[], Error>(
    key,
    async () =>
      fetchEvaluatedTaskIdsByDateAction(teacherId!, studentId!, date!),
    {
      ...SWR_BASE_CONFIG,
      dedupingInterval: SWR_DEDUP.STUDENT_DETAIL,
    },
  );
}

// =====================================================================
// SWRフック: 指定日の評価済み生徒ID（一括評価画面用）
// key に date を含めるため、日付変更で自動再取得される。
// =====================================================================
export function useEvaluatedStudentIdsByDateSWR(
  teacherId: string | null | undefined,
  date: string | null | undefined,
): SWRResponse<string[], Error> {
  const key =
    teacherId && date
      ? buildKey('getEvaluatedStudentIdsByDate', {
          teacher_id: teacherId,
          date,
        })
      : null;

  return useSWR<string[], Error>(
    key,
    async () => fetchEvaluatedStudentIdsByDateAction(teacherId!, date!),
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
  const key =
    teacherId && studentId
      ? buildKey('getStudentDetail', {
          teacher_id: teacherId,
          student_id: studentId,
        })
      : null;

  return useSWR<StudentDetailData, Error>(
    key,
    async () => fetchStudentDetailAction(studentId!, teacherId!),
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
  dashboard: (userId: string) =>
    buildKey('getDashboard', { user_id: userId }),
  teacherDashboard: (teacherId: string) =>
    buildKey('getTeacherDashboard', { teacher_id: teacherId }),
  studentDetail: (teacherId: string, studentId: string) =>
    buildKey('getStudentDetail', {
      teacher_id: teacherId,
      student_id: studentId,
    }),
  // ★ Phase 8: なかま一覧のキー（応援後のrevalidate用）
  nakama: (userId: string) => buildKey('getNakamaList', { user_id: userId }),
} as const;

// =====================================================================
// SWRフック: ミニゲームのプレイ状況（任意・5秒キャッシュ）
// =====================================================================
export function useMinigameStatusSWR() {
  const me = typeof window !== 'undefined' ? getAuthUser() : null;
  const key =
    me?.role === 'student'
      ? buildKey('getMinigameStatus', { user_id: me.id })
      : null;

  return useSWR<MinigameStatus, Error>(
    key,
    async () => fetchMinigameStatusApi(me!.id),
    {
      ...SWR_BASE_CONFIG,
      dedupingInterval: SWR_DEDUP.DASHBOARD,
    },
  );
}

// =====================================================================
// SWRフック: ミニゲームランキング（任意・10秒キャッシュ）
// ★ Phase 6.2: 戻り値型を MinigameRankingResponse（topBest/topAverage）に拡張
// =====================================================================
export function useMinigameRankingSWR() {
  return useSWR<MinigameRankingResponse, Error>(
    'gas:getMinigameRanking',
    fetchMinigameRankingAction,
    {
      ...SWR_BASE_CONFIG,
      dedupingInterval: SWR_DEDUP.TEACHER_LIST,
    },
  );
}

// =====================================================================
// SWRフック: なかま一覧（任意・10秒キャッシュ）
// 応援後に mutate して即時反映する。
// =====================================================================
export function useNakamaListSWR(): SWRResponse<NakamaListResponse, Error> {
  const me = typeof window !== 'undefined' ? getAuthUser() : null;
  const key =
    me?.role === 'student'
      ? buildKey('getNakamaList', { user_id: me.id })
      : null;

  return useSWR<NakamaListResponse, Error>(
    key,
    async () => fetchNakamaListApi(me!.id),
    {
      ...SWR_BASE_CONFIG,
      dedupingInterval: SWR_DEDUP.TEACHER_LIST,
    },
  );
}