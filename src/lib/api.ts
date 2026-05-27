// src/lib/api.ts
// =====================================================================
// 燃えよ剣士 - GAS APIクライアント & SWRフック
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

export async function evaluateStudentApi(
  payload: Omit<TeacherEvalPayload, 'action'> & { teacher_id: string },
): Promise<TeacherEvalResponse> {
  return gasPost<TeacherEvalResponse>({
    action: 'evaluateStudent',
    ...payload,
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
