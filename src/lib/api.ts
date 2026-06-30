// src/lib/api.ts
// =====================================================================
// 燃えろ剣士 - GAS APIクライアント & SWRフック
// Phase 5: 全体評価（一括評価）API追加
// Phase 6:   ミニゲーム『刹那ノ見切』API追加（1日5回・ランキング対応）
// Phase 6.1: ランキングAPIを { top, history } 構造へ拡張（推移グラフ対応）
// Phase 6.2: ランキングを { topBest, topAverage, history } 構造へ拡張
//            （平均タイム/最速タイムのタブ切替対応・0以下のバグデータは完全除外）
// Phase 8:   「なかま」機能（門下生一覧＋応援システム）API追加
// =====================================================================

import useSWR, { SWRConfiguration, SWRResponse } from 'swr';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from './auth';
import {
  calcLevelFromXp,
  calcSelfTaskXp,
  calcTeacherTaskXp,
  calcTechniqueXp,
} from '@/types';
import type {
  User,
  UserStatus,
  DashboardData,
  TeacherDashboardData,
  StudentDetailData,
  SaveLogPayload,
  SaveLogResponse,
  TeacherEvalPayload,
  TeacherEvalResponse,
  TaskLogEntry,
  TechniqueLogEntry,
  Technique,
  TechniqueId,
  XpHistoryEntry,
  TaskMasterEntry,
  TechniqueMasterEntry,
  TitleMasterEntry,
  TeacherEvaluationEntry,
  Achievement,
  AchievementMasterRow,
  NextLevelInfo,
  StudentSummary,
//  NakamaEntry,
//  NakamaListResponse,
//  CheerResponse,
} from '@/types';
import {
  xpForLevel,
  titleForLevel,
  nextTitleLevel,
} from '@/types';

// =====================================================================
// Supabase クライアント（環境変数から生成）
// 旧GASの GAS_URL / gasGet / gasPost は廃止
// =====================================================================
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if ((!SUPABASE_URL || !SUPABASE_ANON_KEY) && typeof window !== 'undefined') {
  console.error(
    '[api] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が設定されていません',
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// =====================================================================
// 共通: Supabase エラーを統一例外へ変換するヘルパー
// =====================================================================
function throwIfError(error: { message: string } | null, context: string): void {
  if (error) {
    throw new Error(`[${context}] ${error.message}`);
  }
}

// =====================================================================
// 共通: 日付（YYYY-MM-DD）を timestamptz 用の ISO 文字列へ変換するヘルパー
// -------------------------------------------------------------------
// DB側の date カラムが text → timestamptz へ変更されたことに伴い、
// 保存前に必ず時刻付き ISO 文字列へ正規化する。
//
// ・date 未指定（当日記録）        → 現在時刻そのまま new Date().toISOString()
// ・date 指定（カレンダーからの遡り）→ JST 正午(12:00+09:00)を基準に ISO 化
//
// JST 正午を基準にする理由:
//   UTC へ変換しても同日内（当日 03:00 UTC）に収まり、
//   -9 時間の時差で前日へ巻き戻る事故を確実に防げるため。
// =====================================================================
function resolveTimestamp(date?: string): string {
  // YYYY-MM-DD 形式（厳密一致）なら「指定日付 ＋ 実行時の現在時刻（JST）」で ISO 化する。
  // ★ 固定正午をやめた理由:
  //   同日に複数アクション（課題記録・先生評価など）があると 12:00 固定では
  //   保存順（時系列）が消失し、推移グラフが「下がって見える」原因になっていた。
  //   そこで「年月日 = 指定日 / 時分秒ミリ秒 = 実行時の現在時刻」を結合し、
  //   同日内でも記録した順番が timestamptz に正しく刻まれるようにする。
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const now = new Date();
    // 実行時の現在時刻を JST（+09:00）として時分秒ミリ秒を取り出す。
    // getTimezoneOffset に依存せず、JST 固定オフセットで安定させる。
    const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const hh = String(jstNow.getUTCHours()).padStart(2, '0');
    const mm = String(jstNow.getUTCMinutes()).padStart(2, '0');
    const ss = String(jstNow.getUTCSeconds()).padStart(2, '0');
    const ms = String(jstNow.getUTCMilliseconds()).padStart(3, '0');
    // 指定された年月日に、いま現在の時刻（JST）を結合して ISO 化する。
    return new Date(`${date}T${hh}:${mm}:${ss}.${ms}+09:00`).toISOString();
  }
  // 未指定・不正値は当日扱い（現在時刻そのまま）。
  return new Date().toISOString();
}

// =====================================================================
// 共通: 指定日（YYYY-MM-DD）の「JST 0:00〜翌日 0:00」を ISO 範囲で返す。
// -------------------------------------------------------------------
// timestamptz カラムは .eq では時刻まで一致しないと判定できないため、
// 「その1日」を切り出すには範囲検索（gte/lt）が必須。
// date 未指定・不正値の場合は当日（JST）を基準にする。
// =====================================================================
function resolveDayRange(date?: string): { startIso: string; endIso: string } {
  // 基準日（YYYY-MM-DD）を確定する。
  const baseDay = (date && /^\d{4}-\d{2}-\d{2}$/.test(date))
    ? date
    // 当日を JST 基準で算出（UTC 変換で前日へズレないよう +9h してから切り出す）。
    : new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const startIso = new Date(`${baseDay}T00:00:00+09:00`).toISOString();
  const endIso = new Date(
    new Date(`${baseDay}T00:00:00+09:00`).getTime() + 24 * 60 * 60 * 1000,
  ).toISOString();

  return { startIso, endIso };
}

// =====================================================================
// 認証API: users テーブルを id + passcode で直接照合
// =====================================================================
export async function loginUser(
  userId: string,
  passcode: string,
): Promise<User> {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, role, grade, passcode')
    .eq('id', userId)
    .eq('passcode', passcode)
    .single();

  throwIfError(error, 'loginUser');

  if (!data) {
    throw new Error('IDまたはあいことばが正しくありません');
  }

  return {
    id:    data.id,
    name:  data.name,
    role:  data.role,
    grade: data.grade != null ? String(data.grade) : undefined,
  };
}

// =====================================================================
// 公開API: ユーザー一覧取得（ログイン画面のドロップダウン用）
// users テーブルから個人情報を最小限に絞って取得
// =====================================================================
import type { UserListResponse, UserListEntry } from '@/types';

export async function fetchUserList(): Promise<UserListResponse> {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, role, grade')
    .order('role', { ascending: true })
    .order('grade', { ascending: true })
    .order('id', { ascending: true });

  throwIfError(error, 'fetchUserList');

  const users: UserListEntry[] = (data ?? []).map((u) => ({
    id:    u.id,
    name:  u.name,
    role:  u.role,
    grade: u.grade != null ? String(u.grade) : undefined,
  }));

  return { users };
}

// SWRフック版（5分キャッシュ・複数ログイン試行に有効）
export function useUserListSWR() {
  return useSWR<UserListResponse, Error>(
    'supabase:getUserList',
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
// =====================================================================
// 自己記録の保存: task_logs / technique_logs を insert し、
// user_techniques・user_status を更新、xp_history を追記する
// =====================================================================
export async function saveLogApi(
  payload: Omit<SaveLogPayload, 'action'> & { user_id: string },
): Promise<SaveLogResponse> {
  const { user_id, date, taskEvals, techniques } = payload;

  // --- timestamptz 対応: 保存用の ISO 文字列へ正規化 ---
  // date は YYYY-MM-DD（カレンダー指定）または undefined（当日）で渡ってくる。
  // 以降、DB へ渡す日付はすべて isoDate（時刻付き ISO）に統一する。
  const isoDate = resolveTimestamp(date);

  // --- ★ 防波堤: 同じ日に「自己評価済み」の課題は二重記録させない ---
  // 自己記録は evaluator_id IS NULL の行。先生評価（evaluator_id = teacherId）とは区別する。
  // timestamptz 化に伴い、対象日の範囲検索（その日の0:00〜翌0:00・JST基準）で判定する。
  // 既存と重複する task_id は安全にスキップし、未記録の課題だけを insert する。
  let acceptedTaskEvals = taskEvals ?? [];
  if (acceptedTaskEvals.length > 0) {
    const { startIso, endIso } = resolveDayRange(date);
    const { data: existingSelf, error: exErr } = await supabase
      .from('task_logs')
      .select('task_id')
      .eq('user_id', user_id)
      .is('evaluator_id', null)
      .gte('date', startIso)
      .lt('date', endIso);
    throwIfError(exErr, 'saveLog:existing_self');

    const alreadyTaskIds = new Set((existingSelf ?? []).map((e) => e.task_id));
    // すでにその日に自己評価済みの課題は除外する。
    acceptedTaskEvals = acceptedTaskEvals.filter(
      (t) => !alreadyTaskIds.has(t.task_id),
    );
  }

  // --- ★ 防波堤: 同じ日に「記録済み」の技は二重記録させない ---
  // 技は自己記録のみ（evaluator_id を持たない）。対象日の範囲検索で判定する。
  // 既存と重複する technique_id は安全にスキップし、未記録の技だけを insert する。
  // ※ user_techniques の累計ポイント加算も、この acceptedTechniques を基準に行う
  //   （重複スキップした技をポイント加算してしまうと二重加算になるため）。
  let acceptedTechniques = techniques ?? [];
  if (acceptedTechniques.length > 0) {
    const { startIso, endIso } = resolveDayRange(date);
    const { data: existingTech, error: exTechErr } = await supabase
      .from('technique_logs')
      .select('technique_id')
      .eq('user_id', user_id)
      .gte('date', startIso)
      .lt('date', endIso);
    throwIfError(exTechErr, 'saveLog:existing_technique');

    const alreadyTechIds = new Set(
      (existingTech ?? []).map((e) => e.technique_id),
    );
    // すでにその日に記録済みの技は除外する。
    acceptedTechniques = acceptedTechniques.filter(
      (t) => !alreadyTechIds.has(t.technique_id),
    );
  }

  // --- 課題（自己評価）行を生成（重複除外後の acceptedTaskEvals を使う） ---
  let xpFromTasks = 0;
  const taskRows = acceptedTaskEvals.map((t) => {
    const xp = calcSelfTaskXp(t.score);
    xpFromTasks += xp;
    return {
      user_id,
      date:         isoDate,
      task_id:      t.task_id,
      score:        t.score,
      xp_earned:    xp,
      evaluator_id: null as string | null,
      comment:      null as string | null,
    };
  });

  // --- 技の記録行を生成（重複除外後の acceptedTechniques を使う） ---
  let xpFromTech = 0;
  const techRows = acceptedTechniques.map((t) => {
    const xp = calcTechniqueXp(t.quantity, t.quality);
    xpFromTech += xp;
    return {
      user_id,
      date:         isoDate,
      technique_id: t.technique_id,
      quantity:     t.quantity,
      quality:      t.quality,
      xp_earned:    xp,
    };
  });

  // --- insert（存在する場合のみ） ---
  if (taskRows.length > 0) {
    const { error } = await supabase.from('task_logs').insert(taskRows);
    throwIfError(error, 'saveLog:task_logs');
  }
  if (techRows.length > 0) {
    const { error } = await supabase.from('technique_logs').insert(techRows);
    throwIfError(error, 'saveLog:technique_logs');
  }

  // --- user_techniques の累計ポイント更新（重複除外後の acceptedTechniques のみ） ---
  // ★ 重複スキップした技はここでも加算しない（二重加算防止）。
  for (const t of acceptedTechniques) {
    const xp = calcTechniqueXp(t.quantity, t.quality);
    const { data: cur, error: selErr } = await supabase
      .from('user_techniques')
      .select('points')
      .eq('user_id', user_id)
      .eq('technique_id', t.technique_id)
      .maybeSingle();
    throwIfError(selErr, 'saveLog:user_techniques.select');

    const nextPoints = (cur?.points ?? 0) + xp;
    const { error: upErr } = await supabase
      .from('user_techniques')
      .upsert(
        {
          user_id,
          technique_id:  t.technique_id,
          points:        nextPoints,
          last_quantity: t.quantity,
          last_quality:  t.quality,
        },
        { onConflict: 'user_id,technique_id' },
      );
    throwIfError(upErr, 'saveLog:user_techniques.upsert');
  }

  const earned = xpFromTasks + xpFromTech;

  // --- ★ 何も記録されなかった場合（全課題が重複スキップ＋技なし）は早期リターン ---
  // user_status / xp_history を無駄に更新しないためのガード。
  if (taskRows.length === 0 && techRows.length === 0) {
    const { data: stNow } = await supabase
      .from('user_status')
      .select('total_xp, level')
      .eq('user_id', user_id)
      .maybeSingle();
    const totalNow = stNow?.total_xp ?? 0;
    return {
      xp_earned:          0,
      xp_from_tasks:      0,
      xp_from_techniques: 0,
      total_xp:           totalNow,
      level:              stNow?.level ?? calcLevelFromXp(totalNow),
      newAchievements:    [],
    };
  }

  // --- user_status の更新（合計XP・レベル・最終稽古日） ---
  // 初回記録などで user_status 行が未作成の場合があるため .maybeSingle() を使う。
  // 0 行のときは null が返るので、初期値 0 から計算を始める。
  const { data: st, error: stErr } = await supabase
    .from('user_status')
    .select('total_xp')
    .eq('user_id', user_id)
    .maybeSingle();
  throwIfError(stErr, 'saveLog:user_status.select');

  const newTotal = (st?.total_xp ?? 0) + earned;
  const newLevel = calcLevelFromXp(newTotal);

  // 行が存在しない場合に備え、update ではなく upsert で「無ければ作る」。
  // last_practice_date も timestamptz 化済みの isoDate で更新する。
  const { error: updErr } = await supabase
    .from('user_status')
    .upsert(
      {
        user_id,
        total_xp:           newTotal,
        level:              newLevel,
        last_practice_date: isoDate,
      },
      { onConflict: 'user_id' },
    );
  throwIfError(updErr, 'saveLog:user_status.update');

  // --- xp_history への追記 ---
  if (earned > 0) {
    const { error: hisErr } = await supabase.from('xp_history').insert({
      user_id,
      date:           isoDate,
      type:           'gain',
      amount:         earned,
      reason:         '自己記録（課題・技）',
      total_xp_after: newTotal,
      level:          newLevel,
    });
    throwIfError(hisErr, 'saveLog:xp_history');
  }

  return {
    xp_earned:          earned,
    xp_from_tasks:      xpFromTasks,
    xp_from_techniques: xpFromTech,
    total_xp:           newTotal,
    level:              newLevel,
    newAchievements:    [],
  };
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

// ★ 互換用エイリアス: 課題ログのみを保存したい画面向け
//   既存インターフェース saveTaskLog を維持（内部は saveLog に委譲）
export async function saveTaskLog(
  payload: { date: string; taskEvals: Array<{ task_id: string; score: number }> },
): Promise<SaveLogResponse> {
  return saveLog({
    action: 'saveLog',
    date:   payload.date,
    taskEvals: payload.taskEvals,
  });
}

// =====================================================================
// 先生個別評価: task_logs を evaluator_id=先生ID で insert し、
// XP×10ボーナスを user_status / xp_history に反映する
// =====================================================================
export async function evaluateStudentApi(
  payload: Omit<TeacherEvalPayload, 'action'> & { teacher_id: string },
): Promise<TeacherEvalResponse> {
  const { teacher_id, student_id, date, evaluations } = payload;

  // --- timestamptz 対応: 評価対象日を ISO 文字列へ正規化 ---
  // date 未指定なら当日、指定（YYYY-MM-DD）ならカレンダーからの遡り評価。
  const isoDate = resolveTimestamp(date);

  // --- 二重評価チェック用に「対象日の JST 0:00〜翌日 0:00」の範囲を算出 ---
  // timestamptz カラムに対しては時刻まで一致させる .eq では判定できないため、
  // 範囲検索（gte/lt）で「その1日」を切り出す。
  // 基準日は date 指定があればそれ、無ければ isoDate を JST 日付へ戻して用いる。
  const baseDay = (date && /^\d{4}-\d{2}-\d{2}$/.test(date))
    ? date
    : new Date(new Date(isoDate).getTime() + 9 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
  const dayStartIso = new Date(`${baseDay}T00:00:00+09:00`).toISOString();
  const dayEndIso   = new Date(`${baseDay}T00:00:00+09:00`).getTime() + 24 * 60 * 60 * 1000;
  const dayEndIsoStr = new Date(dayEndIso).toISOString();

  // --- 対象日すでに「この先生」が評価済みの課題は二重評価を避ける ---
  // ★ 二重評価防止は先生ごとに独立させる（evaluator_id = teacher_id で絞る）。
  //   日付は timestamptz 化に伴い範囲検索（その日の0:00〜翌0:00）で判定する。
  const { data: existing, error: exErr } = await supabase
    .from('task_logs')
    .select('task_id')
    .eq('user_id', student_id)
    .gte('date', dayStartIso)
    .lt('date', dayEndIsoStr)
    .eq('evaluator_id', teacher_id);
  throwIfError(exErr, 'evaluateStudent:existing');

  const alreadyTasks = new Set((existing ?? []).map((e) => e.task_id));

  let xpGranted = 0;
  let evaluatedCount = 0;
  const rows = evaluations
    .filter((ev) => !alreadyTasks.has(ev.task_id))
    .map((ev) => {
      const xp = calcTeacherTaskXp(ev.score);
      xpGranted += xp;
      evaluatedCount += 1;
      return {
        user_id:      student_id,
        date:         isoDate,
        task_id:      ev.task_id,
        score:        ev.score,
        xp_earned:    xp,
        evaluator_id: teacher_id,
        comment:      ev.comment ?? null,
      };
    });

  if (rows.length > 0) {
    const { error } = await supabase.from('task_logs').insert(rows);
    throwIfError(error, 'evaluateStudent:insert');
  }

  // --- user_status 更新 ---
  // user_status 行が未作成の生徒に備えて .maybeSingle() を使う（0 行でも例外にしない）。
  const { data: st, error: stErr } = await supabase
    .from('user_status')
    .select('total_xp')
    .eq('user_id', student_id)
    .maybeSingle();
  throwIfError(stErr, 'evaluateStudent:user_status.select');

  const newTotal = (st?.total_xp ?? 0) + xpGranted;
  const newLevel = calcLevelFromXp(newTotal);

  // 行が無い場合に備え、update ではなく upsert で「無ければ作る」。
  // ★ 先生評価も「その日の稽古」とみなし、last_practice_date を isoDate に更新する。
  //   これを更新しないと、先生評価のみを受けている生徒が
  //   「サボり（長期間未稽古）」と誤判定されてしまうため。
  const { error: updErr } = await supabase
    .from('user_status')
    .upsert(
      {
        user_id:            student_id,
        total_xp:           newTotal,
        level:              newLevel,
        last_practice_date: isoDate,
      },
      { onConflict: 'user_id' },
    );
  throwIfError(updErr, 'evaluateStudent:user_status.update');

  if (xpGranted > 0) {
    const { error: hisErr } = await supabase.from('xp_history').insert({
      user_id:        student_id,
      date:           isoDate,
      type:           'teacher_eval',
      amount:         xpGranted,
      reason:         '先生からの評価',
      total_xp_after: newTotal,
      level:          newLevel,
    });
    throwIfError(hisErr, 'evaluateStudent:xp_history');
  }

  return {
    xp_granted:      xpGranted,
    student_level:   newLevel,
    evaluated_count: evaluatedCount,
  };
}

// ★ 先生画面から呼びやすい便利ラッパー（個別評価）
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

// =====================================================================
// ★★★ Phase 5 追加: 全体評価（一括評価）API ★★★
// =====================================================================

/**
 * 全体評価（一括評価）リクエストの型定義
 */
export interface BulkEvalPayload {
  /** 評価対象の生徒IDの配列（チェックボックスで選択された生徒） */
  student_ids: string[];
  /** 評価対象日（YYYY-MM-DD）。未指定の場合は当日として扱う（カレンダーからの遡り評価に対応） */
  date?:       string;
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
 * 内部API: 全体評価を Supabase へ反映
 * 各生徒に対して evaluateStudentApi を順次適用し、結果を集約する。
 */
export async function evaluateBulkStudentsApi(
  payload: BulkEvalPayload & { teacher_id: string },
): Promise<BulkEvalResponse> {
  const { teacher_id, student_ids, date, evaluations } = payload;

  // --- timestamptz 対応: 評価対象日を ISO 文字列へ正規化 ---
  // date 未指定なら当日、指定（YYYY-MM-DD）ならカレンダーからの遡り評価。
  const isoDate = resolveTimestamp(date);

  // --- 二重評価チェック用に「対象日の JST 0:00〜翌日 0:00」の範囲を算出 ---
  // timestamptz カラムに対しては .eq では判定できないため範囲検索（gte/lt）を用いる。
  // 基準日は date 指定があればそれ、無ければ isoDate を JST 日付へ戻して用いる。
  const baseDay = (date && /^\d{4}-\d{2}-\d{2}$/.test(date))
    ? date
    : new Date(new Date(isoDate).getTime() + 9 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
  const dayStartIso = new Date(`${baseDay}T00:00:00+09:00`).toISOString();
  const dayEndIsoStr = new Date(
    new Date(`${baseDay}T00:00:00+09:00`).getTime() + 24 * 60 * 60 * 1000,
  ).toISOString();

  const results: BulkEvalResponse['results'] = [];
  const failures: BulkEvalResponse['failures'] = [];
  let processedCount = 0;
  let failedCount = 0;
  let totalXpGranted = 0;

  for (const sid of student_ids) {
    try {
      // 評価前の二重チェック件数を把握するため、対象日に先生評価済みの課題を取得。
      // 自己記録は evaluator_id = null。先生評価は「null でない行」で判定する。
      // 日付は timestamptz 化に伴い範囲検索（その日の0:00〜翌0:00）で判定する。
      const { data: existing } = await supabase
        .from('task_logs')
        .select('task_id')
        .eq('user_id', sid)
        .gte('date', dayStartIso)
        .lt('date', dayEndIsoStr)
        .not('evaluator_id', 'is', null);
      const already = new Set((existing ?? []).map((e) => e.task_id));
      const skipped = evaluations.filter((ev) => already.has(ev.task_id)).length;

      // ★ 個別評価APIへ date を引き渡すことで、保存日・二重評価判定を対象日に統一する。
      const res = await evaluateStudentApi({
        teacher_id,
        student_id:  sid,
        date,
        evaluations,
      });

      // 生徒名取得（サマリ表示用）
      const { data: u } = await supabase
        .from('users')
        .select('name')
        .eq('id', sid)
        .single();

      const { data: st } = await supabase
        .from('user_status')
        .select('total_xp')
        .eq('user_id', sid)
        .single();

      totalXpGranted += res.xp_granted;
      processedCount += 1;
      results.push({
        student_id:    sid,
        student_name:  u?.name ?? sid,
        xp_granted:    res.xp_granted,
        new_total_xp:  st?.total_xp ?? 0,
        new_level:     res.student_level,
        skipped_count: skipped,
      });
    } catch (e) {
      failedCount += 1;
      failures.push({
        student_id: sid,
        reason:     e instanceof Error ? e.message : '不明なエラー',
      });
    }
  }

  const xpPerStudent =
    processedCount > 0 ? Math.round(totalXpGranted / processedCount) : 0;

  return {
    processed_count:  processedCount,
    failed_count:     failedCount,
    failures,
    total_xp_granted: totalXpGranted,
    xp_per_student:   xpPerStudent,
    multiplier:       TEACHER_EVAL_MULTIPLIER_REF,
    evaluated_count:  evaluations.length,
    results,
  };
}

// 全体評価レスポンスの multiplier 表示用（types の TEACHER_EVAL_MULTIPLIER を参照）
const TEACHER_EVAL_MULTIPLIER_REF = 10;

/**
 * 公開ラッパー: 全体評価ページから呼びやすい関数
 * ログイン中の先生IDを内部で自動付与する
 *
 * 例:
 * await evaluateBulkStudents({
 * student_ids: ['U001', 'U002'],
 * evaluations: [
 * { task_id: 'K001', score: 5 },
 * { task_id: 'K002', score: 4, comment: 'よくがんばった' },
 * ],
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
    teacher_id:  me.id,
    student_ids: uniqueIds,
    date:        payload.date,
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
// ダッシュボード: 各テーブルを Promise.all でパラレルフェッチして組み立て
// =====================================================================

/** xp_history から「先生評価」「総稽古回数」を概算するための内部ユーティリティ */
function buildNextLevelInfo(
  totalXp: number,
  level: number,
  titleMaster: TitleMasterEntry[],
): NextLevelInfo {
  const nextLv = nextTitleLevel(level, titleMaster);
  const requiredAbs = xpForLevel(level + 1);
  return {
    required: requiredAbs > totalXp ? requiredAbs - totalXp : null,
    title: nextLv ? nextLv.title : titleForLevel(level, titleMaster),
  };
}

export async function fetchDashboard(userId: string): Promise<DashboardData> {
  if (!userId) {
    throw new Error('user_id が指定されていません');
  }

  const today = new Date().toISOString().slice(0, 10);
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // --- パラレルフェッチ ---
  const [
    userRes,
    statusRes,
    taskMasterRes,
    techMasterRes,
    titleMasterRes,
    taskLogsRes,
    techLogsRes,
    userTechRes,
    xpHistoryRes,
    achMasterRes,
    userAchRes,
  ] = await Promise.all([
    supabase.from('users').select('id, name, role, grade').eq('id', userId).single(),
    supabase
      .from('user_status')
      .select(
        'user_id, total_xp, level, last_practice_date, last_decay_date, favorite_technique, catchphrase',
      )
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('task_master')
      .select('id, task_text, display_order, grade_min')
      .order('display_order', { ascending: true }),
    supabase
      .from('technique_master')
      .select('id, name, display_order')
      .order('display_order', { ascending: true }),
    supabase
      .from('title_master')
      .select('level, title')
      .order('level', { ascending: true }),
    supabase
      .from('task_logs')
      .select('id, user_id, date, task_id, score, xp_earned, evaluator_id, comment')
      .eq('user_id', userId)
      .gte('date', since30)
      .order('date', { ascending: false }),
    supabase
      .from('technique_logs')
      .select('id, user_id, date, technique_id, quantity, quality, xp_earned')
      .eq('user_id', userId)
      .gte('date', since30)
      .order('date', { ascending: false }),
    supabase
      .from('user_techniques')
      .select('user_id, technique_id, points, last_quantity, last_quality')
      .eq('user_id', userId),
    supabase
      .from('xp_history')
      .select('id, user_id, date, type, amount, reason, total_xp_after, level')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(100),
    supabase
      .from('achievement_master')
      .select(
        'achievement_id, name, condition_type, condition_value, description, hint, icon_type',
      ),
    supabase
      .from('user_achievements')
      .select('user_id, achievement_id, unlocked_at')
      .eq('user_id', userId),
  ]);

  throwIfError(userRes.error, 'fetchDashboard:users');
  throwIfError(taskMasterRes.error, 'fetchDashboard:task_master');
  throwIfError(techMasterRes.error, 'fetchDashboard:technique_master');
  throwIfError(titleMasterRes.error, 'fetchDashboard:title_master');
  throwIfError(taskLogsRes.error, 'fetchDashboard:task_logs');
  throwIfError(techLogsRes.error, 'fetchDashboard:technique_logs');
  throwIfError(userTechRes.error, 'fetchDashboard:user_techniques');
  throwIfError(xpHistoryRes.error, 'fetchDashboard:xp_history');
  throwIfError(achMasterRes.error, 'fetchDashboard:achievement_master');
  throwIfError(userAchRes.error, 'fetchDashboard:user_achievements');

  if (!userRes.data) {
    throw new Error('ユーザーが見つかりません');
  }

  // --- マスター類の整形 ---
  const taskMaster: TaskMasterEntry[] = (taskMasterRes.data ?? []).map((t) => ({
    id:            t.id,
    task_text:     t.task_text,
    display_order: t.display_order,
    grade_min:     t.grade_min,
  }));

  const techniqueMaster: TechniqueMasterEntry[] = (techMasterRes.data ?? []).map(
    (t) => ({
      id:           t.id as TechniqueId,
      name:         t.name,
      displayOrder: t.display_order,
    }),
  );

  const titleMaster: TitleMasterEntry[] = (titleMasterRes.data ?? []).map((t) => ({
    level: t.level,
    title: t.title,
  }));

  // --- 先生の名前を取得してマッピング（★追加） ---
  const evalIdsSet = new Set<string>();
  (taskLogsRes.data ?? []).forEach(l => {
    if (l.evaluator_id && l.evaluator_id !== 'self') {
      evalIdsSet.add(l.evaluator_id);
    }
  });
  const evalIds = Array.from(evalIdsSet);
  const { data: evalUsersRes } = evalIds.length > 0
    ? await supabase.from('users').select('id, name').in('id', evalIds)
    : { data: [] };
  const evaluatorNameMap = new Map((evalUsersRes ?? []).map(u => [u.id, u.name]));

  // --- task_master を辞書化して task_logs に task_text を結合 ---
  const taskTextMap = new Map<string, string>(
    taskMaster.map((t) => [t.id, t.task_text]),
  );

  const taskLogs: TaskLogEntry[] = (taskLogsRes.data ?? []).map((l) => ({
    id:           l.id,
    user_id:      l.user_id,
    date:         l.date,
    task_id:      l.task_id,
    task_text:    taskTextMap.get(l.task_id) ?? '',
    score:        l.score,
    xp_earned:    l.xp_earned,
    evaluator_id: l.evaluator_id ?? undefined,
    evaluator_name: l.evaluator_id && l.evaluator_id !== 'self' ? evaluatorNameMap.get(l.evaluator_id) : undefined,
    comment:      l.comment ?? undefined,
  }));

  const techniqueLogs: TechniqueLogEntry[] = (techLogsRes.data ?? []).map((l) => ({
    date:         l.date,
    technique_id: l.technique_id as TechniqueId,
    quantity:     l.quantity,
    quality:      l.quality,
    xp_earned:    l.xp_earned,
  }));

  // --- 三角レーダー用 techniques（technique_master を基準に user_techniques を結合） ---
  const userTechMap = new Map(
    (userTechRes.data ?? []).map((ut) => [ut.technique_id, ut]),
  );
  const techniques: Technique[] = techniqueMaster.map((tm) => {
    const ut = userTechMap.get(tm.id);
    return {
      id:            tm.id,
      name:          tm.name,
      points:        ut?.points ?? 0,
      last_quantity: (ut?.last_quantity ?? null) as Technique['last_quantity'],
      last_quality:  (ut?.last_quality ?? null) as Technique['last_quality'],
    };
  });

  const xpHistory: XpHistoryEntry[] = (xpHistoryRes.data ?? []).map((h) => ({
    date:           h.date,
    type:           h.type,
    amount:         h.amount,
    reason:         h.reason,
    total_xp_after: h.total_xp_after,
    level:          h.level,
  }));

  // --- 先生評価のみ抽出（evaluator_id が 'self' 以外） ---
  const teacherEvals: TeacherEvaluationEntry[] = taskLogs
    .filter((l) => l.evaluator_id && l.evaluator_id !== 'self')
    .map((l) => ({
      date:         l.date,
      task_id:      l.task_id,
      task_text:    l.task_text ?? '',
      score:        l.score,
      xp_earned:    l.xp_earned,
      evaluator_id: l.evaluator_id ?? '',
      evaluator_name: l.evaluator_name, // ★追加（マッピングされた名前）
      comment:      l.comment,
    }));

  // --- ステータス（user_status が無ければ初期値で補完） ---
  const rawStatus = statusRes.data;
  const totalXp = rawStatus?.total_xp ?? 0;
  const level = rawStatus?.level ?? calcLevelFromXp(totalXp);
  const status: UserStatus = {
    total_xp:           totalXp,
    level,
    last_practice_date: rawStatus?.last_practice_date ?? null,
    last_decay_date:    rawStatus?.last_decay_date ?? null,
    favorite_technique: rawStatus?.favorite_technique ?? undefined,
    catchphrase:        rawStatus?.catchphrase ?? '',
  };

  // --- 実績（achievement_master × user_achievements） ---
  const unlockedMap = new Map<string, string | null>(
    (userAchRes.data ?? []).map((ua) => [ua.achievement_id, ua.unlocked_at ?? null]),
  );
  const achievements: Achievement[] = (
    (achMasterRes.data ?? []) as AchievementMasterRow[]
  ).map((m) => {
    const unlockedAt = unlockedMap.has(m.achievement_id)
      ? unlockedMap.get(m.achievement_id) ?? null
      : null;
    return {
      id:          m.achievement_id,
      name:        m.name,
      description: m.description,
      hint:        m.hint,
      iconType:    m.icon_type,
      isUnlocked:  unlockedMap.has(m.achievement_id),
      unlockedAt,
    };
  });

  const user: User = {
    id:    userRes.data.id,
    name:  userRes.data.name,
    role:  userRes.data.role,
    grade: userRes.data.grade != null ? String(userRes.data.grade) : undefined,
  };

  return {
    user,
    status,
    taskMaster,
    techniqueMaster,
    titleMaster,
    taskLogs,
    techniqueLogs,
    techniques,
    xpHistory,
    teacherEvals,
    nextLevelXp: buildNextLevelInfo(totalXp, level, titleMaster),
    achievements,
  };
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
    async () => fetchDashboard(userId!),
    {
      ...SWR_BASE_CONFIG,
      dedupingInterval: SWR_DEDUP.DASHBOARD,
    },
  );
}

// =====================================================================
// 先生ダッシュボード: 門下生一覧を Supabase からパラレル取得して組み立て
// =====================================================================
export async function fetchTeacherDashboard(
  teacherId: string,
): Promise<TeacherDashboardData> {
  // 本日（YYYY-MM-DD）。ログイン中の先生が本日評価済みの生徒を判定するために使う。
  const today = new Date().toISOString().slice(0, 10);

  const [
    teacherRes,
    studentsRes,
    statusRes,
    techRes,
    titleRes,
    taskRes,
    myEvalTodayRes,
  ] = await Promise.all([
    supabase.from('users').select('id, name, role, grade').eq('id', teacherId).single(),
    supabase.from('users').select('id, name, grade').eq('role', 'student'),
    supabase
      .from('user_status')
      .select('user_id, total_xp, level, last_practice_date'),
    supabase.from('user_techniques').select('user_id, technique_id, points'),
    supabase.from('title_master').select('level, title').order('level', { ascending: true }),
    supabase
      .from('task_master')
      .select('id, task_text, display_order, grade_min')
      .order('display_order', { ascending: true }),
    // ★ 追加: 本日、この先生（teacherId）が評価した task_logs の user_id 一覧。
    //         評価は先生ごとに独立しているため evaluator_id = teacherId で絞る。
    supabase
      .from('task_logs')
      .select('user_id')
      .eq('date', today)
      .eq('evaluator_id', teacherId),
  ]);

  throwIfError(teacherRes.error, 'fetchTeacherDashboard:teacher');
  throwIfError(studentsRes.error, 'fetchTeacherDashboard:students');
  throwIfError(statusRes.error, 'fetchTeacherDashboard:user_status');
  throwIfError(techRes.error, 'fetchTeacherDashboard:user_techniques');
  throwIfError(titleRes.error, 'fetchTeacherDashboard:title_master');
  throwIfError(taskRes.error, 'fetchTeacherDashboard:task_master');
  throwIfError(myEvalTodayRes.error, 'fetchTeacherDashboard:my_eval_today');

  if (!teacherRes.data) {
    throw new Error('先生ユーザーが見つかりません');
  }

  const statusMap = new Map(
    (statusRes.data ?? []).map((s) => [s.user_id, s]),
  );

  // ★ 追加: 本日この先生が評価済みの生徒IDセット（重複防止フラグ用）
  const evaluatedTodayByMe = new Set(
    (myEvalTodayRes.data ?? []).map((e) => e.user_id),
  );

  // 生徒×技ポイントを集計
  const techByUser = new Map<string, { T001: number; T002: number; T003: number }>();
  for (const t of techRes.data ?? []) {
    const cur = techByUser.get(t.user_id) ?? { T001: 0, T002: 0, T003: 0 };
    if (t.technique_id === 'T001') cur.T001 = t.points;
    if (t.technique_id === 'T002') cur.T002 = t.points;
    if (t.technique_id === 'T003') cur.T003 = t.points;
    techByUser.set(t.user_id, cur);
  }

  const now = Date.now();
  const students: StudentSummary[] = (studentsRes.data ?? []).map((u) => {
    const st = statusMap.get(u.id);
    const last = st?.last_practice_date ?? null;
    const days =
      last != null
        ? Math.floor((now - new Date(last).getTime()) / (24 * 60 * 60 * 1000))
        : null;
    return {
      user_id:               u.id,
      name:                  u.name,
      grade:                 u.grade != null ? String(u.grade) : undefined,
      level:                 st?.level ?? 1,
      total_xp:              st?.total_xp ?? 0,
      last_practice_date:    last,
      techniquePoints:       techByUser.get(u.id) ?? { T001: 0, T002: 0, T003: 0 },
      daysSinceLastPractice: days,
      // ★ 追加: 本日この先生が評価済みなら true（全体評価の選択制御に使用）
      evaluated_today_by_me: evaluatedTodayByMe.has(u.id),
    };
  });

  const titleMaster: TitleMasterEntry[] = (titleRes.data ?? []).map((t) => ({
    level: t.level,
    title: t.title,
  }));

  const taskMaster: TaskMasterEntry[] = (taskRes.data ?? []).map((t) => ({
    id:            t.id,
    task_text:     t.task_text,
    display_order: t.display_order,
    grade_min:     t.grade_min,
  }));

  return {
    teacher: {
      id:    teacherRes.data.id,
      name:  teacherRes.data.name,
      role:  teacherRes.data.role,
      grade: teacherRes.data.grade != null ? String(teacherRes.data.grade) : undefined,
    },
    students,
    titleMaster,
    taskMaster,
  };
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
    async () => fetchTeacherDashboard(teacherId!),
    {
      ...SWR_BASE_CONFIG,
      dedupingInterval: SWR_DEDUP.TEACHER_LIST,
    },
  );
}

// =====================================================================
// 生徒詳細: 先生が個別生徒画面を開いた際のデータを組み立て
// =====================================================================
export async function fetchStudentDetail(
  studentId: string,
  teacherId: string,
): Promise<StudentDetailData> {
  const today = new Date().toISOString().slice(0, 10);
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [studentRes, statusRes, taskRes, titleRes, logsRes, techRes, techMasterRes] =
    await Promise.all([
      supabase.from('users').select('id, name, role, grade').eq('id', studentId).single(),
      supabase
        .from('user_status')
        .select(
          'user_id, total_xp, level, last_practice_date, last_decay_date, favorite_technique, catchphrase',
        )
        .eq('user_id', studentId)
        .maybeSingle(),
      supabase
        .from('task_master')
        .select('id, task_text, display_order, grade_min')
        .order('display_order', { ascending: true }),
      supabase.from('title_master').select('level, title').order('level', { ascending: true }),
      supabase
        .from('task_logs')
        .select('id, user_id, date, task_id, score, xp_earned, evaluator_id, comment')
        .eq('user_id', studentId)
        .gte('date', since30)
        .order('date', { ascending: false }),
      supabase
        .from('user_techniques')
        .select('user_id, technique_id, points, last_quantity, last_quality')
        .eq('user_id', studentId),
      supabase
        .from('technique_master')
        .select('id, name, display_order')
        .order('display_order', { ascending: true }),
    ]);

  throwIfError(studentRes.error, 'fetchStudentDetail:student');
  throwIfError(taskRes.error, 'fetchStudentDetail:task_master');
  throwIfError(titleRes.error, 'fetchStudentDetail:title_master');
  throwIfError(logsRes.error, 'fetchStudentDetail:task_logs');
  throwIfError(techRes.error, 'fetchStudentDetail:user_techniques');
  throwIfError(techMasterRes.error, 'fetchStudentDetail:technique_master');

  if (!studentRes.data) {
    throw new Error('門下生が見つかりません');
  }

  const taskMaster: TaskMasterEntry[] = (taskRes.data ?? []).map((t) => ({
    id:            t.id,
    task_text:     t.task_text,
    display_order: t.display_order,
    grade_min:     t.grade_min,
  }));
  const taskTextMap = new Map<string, string>(
    taskMaster.map((t) => [t.id, t.task_text]),
  );

  // --- 先生の名前を取得してマッピング（★追加） ---
  const evalIdsSet = new Set<string>();
  (logsRes.data ?? []).forEach(l => {
    if (l.evaluator_id && l.evaluator_id !== 'self') {
      evalIdsSet.add(l.evaluator_id);
    }
  });
  const evalIds = Array.from(evalIdsSet);
  const { data: evalUsersRes } = evalIds.length > 0
    ? await supabase.from('users').select('id, name').in('id', evalIds)
    : { data: [] };
  const evaluatorNameMap = new Map((evalUsersRes ?? []).map(u => [u.id, u.name]));

  const recentLogs: TaskLogEntry[] = (logsRes.data ?? []).map((l) => ({
    id:           l.id,
    user_id:      l.user_id,
    date:         l.date,
    task_id:      l.task_id,
    task_text:    taskTextMap.get(l.task_id) ?? '',
    score:        l.score,
    xp_earned:    l.xp_earned,
    evaluator_id: l.evaluator_id ?? undefined,
    evaluator_name: l.evaluator_id && l.evaluator_id !== 'self' ? evaluatorNameMap.get(l.evaluator_id) : undefined,
    comment:      l.comment ?? undefined,
  }));

  // ★ 修正: teacherEvals をAPI側でしっかり構築し、戻り値に含める
  const teacherEvals: TeacherEvaluationEntry[] = recentLogs
    .filter((l) => l.evaluator_id && l.evaluator_id !== 'self')
    .map((l) => ({
      date:         l.date,
      task_id:      l.task_id,
      task_text:    l.task_text ?? '',
      score:        l.score,
      xp_earned:    l.xp_earned,
      evaluator_id: l.evaluator_id ?? '',
      evaluator_name: l.evaluator_name, // ★追加（マッピングされた名前）
      comment:      l.comment,
    }));

  const techMaster = (techMasterRes.data ?? []) as Array<{
    id: string;
    name: string;
    display_order: number;
  }>;
  const userTechMap = new Map(
    (techRes.data ?? []).map((ut) => [ut.technique_id, ut]),
  );
  const techniques: Technique[] = techMaster.map((tm) => {
    const ut = userTechMap.get(tm.id);
    return {
      id:            tm.id as TechniqueId,
      name:          tm.name,
      points:        ut?.points ?? 0,
      last_quantity: (ut?.last_quantity ?? null) as Technique['last_quantity'],
      last_quality:  (ut?.last_quality ?? null) as Technique['last_quality'],
    };
  });

  // 当日すでに「この先生」が評価済みの課題ID（連打防止）
  const todayEvaluatedTaskIds = recentLogs
    .filter((l) => l.date === today && l.evaluator_id === teacherId)
    .map((l) => l.task_id);

  const rawStatus = statusRes.data;
  const totalXp = rawStatus?.total_xp ?? 0;
  const status: UserStatus = {
    total_xp:           totalXp,
    level:              rawStatus?.level ?? calcLevelFromXp(totalXp),
    last_practice_date: rawStatus?.last_practice_date ?? null,
    last_decay_date:    rawStatus?.last_decay_date ?? null,
    favorite_technique: rawStatus?.favorite_technique ?? undefined,
    catchphrase:        rawStatus?.catchphrase ?? '',
  };

  const titleMaster: TitleMasterEntry[] = (titleRes.data ?? []).map((t) => ({
    level: t.level,
    title: t.title,
  }));

  return {
    student: {
      id:    studentRes.data.id,
      name:  studentRes.data.name,
      role:  studentRes.data.role,
      grade: studentRes.data.grade != null ? String(studentRes.data.grade) : undefined,
    },
    status,
    taskMaster,
    titleMaster,
    recentLogs,
    techniques,
    todayEvaluatedTaskIds,
    teacherEvals, // ★ 追加: これにより先生側の画面で teacherEvals が利用可能に
  };
}

// =====================================================================
// ★ 指定日に「この先生」が評価済みの課題ID一覧を取得（個別評価の二重防止用）
// -------------------------------------------------------------------
// 先生が評価対象日を変更するたびに呼び出し、その日の評価済みタスクを反映する。
// 評価は先生ごとに独立しているため evaluator_id = teacherId で絞る。
// 日付は timestamptz 化に伴い範囲検索（その日の0:00〜翌0:00）で判定する。
// =====================================================================
export async function fetchEvaluatedTaskIdsByDate(
  teacherId: string,
  studentId: string,
  date: string,
): Promise<string[]> {
  if (!teacherId || !studentId || !date) {
    return [];
  }

  const { startIso, endIso } = resolveDayRange(date);

  const { data, error } = await supabase
    .from('task_logs')
    .select('task_id')
    .eq('user_id', studentId)
    .eq('evaluator_id', teacherId)
    .gte('date', startIso)
    .lt('date', endIso);

  throwIfError(error, 'fetchEvaluatedTaskIdsByDate');

  // 重複を除いた task_id 配列で返す。
  return Array.from(new Set((data ?? []).map((r) => r.task_id)));
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
  const key = (teacherId && studentId && date)
    ? buildKey('getEvaluatedTaskIdsByDate', {
        teacher_id: teacherId,
        student_id: studentId,
        date,
      })
    : null;

  return useSWR<string[], Error>(
    key,
    async () => fetchEvaluatedTaskIdsByDate(teacherId!, studentId!, date!),
    {
      ...SWR_BASE_CONFIG,
      dedupingInterval: SWR_DEDUP.STUDENT_DETAIL,
    },
  );
}

// =====================================================================
// ★ 指定日に「この先生」が評価済みの生徒ID一覧を取得（一括評価の二重防止用）
// -------------------------------------------------------------------
// 先生が評価対象日を変更するたびに呼び出し、その日の評価済み生徒を反映する。
// 評価は先生ごとに独立しているため evaluator_id = teacherId で絞る。
// 日付は timestamptz 化に伴い範囲検索（その日の0:00〜翌0:00）で判定する。
// =====================================================================
export async function fetchEvaluatedStudentIdsByDate(
  teacherId: string,
  date: string,
): Promise<string[]> {
  if (!teacherId || !date) {
    return [];
  }

  const { startIso, endIso } = resolveDayRange(date);

  const { data, error } = await supabase
    .from('task_logs')
    .select('user_id')
    .eq('evaluator_id', teacherId)
    .gte('date', startIso)
    .lt('date', endIso);

  throwIfError(error, 'fetchEvaluatedStudentIdsByDate');

  // 重複を除いた user_id 配列で返す。
  return Array.from(new Set((data ?? []).map((r) => r.user_id)));
}

// =====================================================================
// SWRフック: 指定日の評価済み生徒ID（一括評価画面用）
// key に date を含めるため、日付変更で自動再取得される。
// =====================================================================
export function useEvaluatedStudentIdsByDateSWR(
  teacherId: string | null | undefined,
  date: string | null | undefined,
): SWRResponse<string[], Error> {
  const key = (teacherId && date)
    ? buildKey('getEvaluatedStudentIdsByDate', {
        teacher_id: teacherId,
        date,
      })
    : null;

  return useSWR<string[], Error>(
    key,
    async () => fetchEvaluatedStudentIdsByDate(teacherId!, date!),
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
    async () => fetchStudentDetail(studentId!, teacherId!),
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
  // ★ Phase 8 追加: なかま一覧のキー（応援後のrevalidate用）
  nakama:           (userId: string) => buildKey('getNakamaList', { user_id: userId }),
} as const;

// =====================================================================
// ★★★ Phase 6: ミニゲーム『刹那ノ見切』API（重複排除・統合版） ★★★
// ★★★ Phase 6.1: ランキングを { top, history } 構造へ拡張       ★★★
// ★★★ Phase 6.2: ランキングを { topBest, topAverage, history } へ拡張 ★★★
// =====================================================================

/**
 * ミニゲームのランク（フロント・GAS共通）
 */
export type MinigameRank = 'S' | 'A' | 'B' | 'C' | 'F';

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
 * ランキング1件分（topBest / topAverage 共通）
 * ★ Phase 6.2: bestTimeMs は「その指標での代表タイム(ms)」を表す。
 *   - topBest   … そのユーザーの全プレイ中の最速タイム（最小値）
 *   - topAverage … そのユーザーの全プレイの平均タイム（合計÷回数）
 *   既存フロント（formatTime 等）との互換のためフィールド名は bestTimeMs を維持する。
 */
export interface MinigameRankingEntry {
  /** 生徒ID */
  userId:     string;
  /** 生徒名 */
  name:       string;
  /** 代表タイム（ms・小さいほど速い） */
  bestTimeMs: number;
  /** ★ Phase 6.2: このユーザーの有効プレイ回数（0以下を除外した件数・参考表示用） */
  playCount:  number;
}

/**
 * ★ Phase 6.1: 推移グラフ用の1系列（1人分のタイム推移）
 */
export interface MinigameRankingSeries {
  /** 生徒ID */
  userId: string;
  /** 生徒名（グラフの凡例に使用） */
  name:   string;
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

/**
 * 内部API: 本日のプレイ状況を minigame_scores から算出
 * 1日の上限は 5。本日分の件数と全期間ベストタイムを集計する。
 */
const MINIGAME_DAILY_LIMIT = 5;

export async function fetchMinigameStatusApi(
  userId: string,
): Promise<MinigameStatus> {
  const today = new Date().toISOString().slice(0, 10);

  const [todayRes, bestRes] = await Promise.all([
    supabase
      .from('minigame_scores')
      .select('id, created_at')
      .eq('user_id', userId)
      .gte('created_at', `${today}T00:00:00`)
      .lte('created_at', `${today}T23:59:59`),
    supabase
      .from('minigame_scores')
      .select('average_time')
      .eq('user_id', userId)
      .gt('average_time', 0) // ★ 0.000秒バグ（不正データ）の除外
      .order('average_time', { ascending: true })
      .limit(1),
  ]);

  throwIfError(todayRes.error, 'fetchMinigameStatus:today');
  throwIfError(bestRes.error, 'fetchMinigameStatus:best');

  const todayPlayed = (todayRes.data ?? []).length;
  const remaining = Math.max(0, MINIGAME_DAILY_LIMIT - todayPlayed);

  return {
    todayPlayed,
    dailyLimit: MINIGAME_DAILY_LIMIT,
    remaining,
    locked:     remaining <= 0,
    bestTimeMs: bestRes.data && bestRes.data.length > 0
      ? bestRes.data[0].average_time
      : null,
  };
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
 * 内部API: 試合結果を minigame_scores に insert し、
 * 獲得XPを user_status / xp_history に反映する
 */
const MINIGAME_RANK_XP: Record<MinigameRank, number> = {
  S: 30,
  A: 20,
  B: 10,
  C: 5,
  F: 2,
};

export async function saveMinigameResultApi(
  payload: {
    user_id:     string;
    averageTime: number;
    rank:        MinigameRank;
  },
): Promise<MinigameSaveResult> {
  const { user_id, averageTime, rank } = payload;
  const earnedXp = MINIGAME_RANK_XP[rank] ?? 0;

  // --- スコア行を保存 ---
  const { error: insErr } = await supabase.from('minigame_scores').insert({
    user_id,
    created_at:   new Date().toISOString(),
    average_time: averageTime,
    rank,
    earned_xp:    earnedXp,
  });
  throwIfError(insErr, 'saveMinigameResult:insert');

  // --- user_status 更新 ---
  // user_status 行が未作成のユーザーに備えて .maybeSingle() を使う（0 行でも例外にしない）。
  const { data: st, error: stErr } = await supabase
    .from('user_status')
    .select('total_xp, level')
    .eq('user_id', user_id)
    .maybeSingle();
  throwIfError(stErr, 'saveMinigameResult:user_status.select');

  const prevLevel = st?.level ?? 1;
  const newTotal = (st?.total_xp ?? 0) + earnedXp;
  const newLevel = calcLevelFromXp(newTotal);

  // 行が無い場合に備え、update ではなく upsert で「無ければ作る」。
  const { error: updErr } = await supabase
    .from('user_status')
    .upsert(
      {
        user_id,
        total_xp: newTotal,
        level:    newLevel,
      },
      { onConflict: 'user_id' },
    );
  throwIfError(updErr, 'saveMinigameResult:user_status.update');

  const today = new Date().toISOString().slice(0, 10);
  const { error: hisErr } = await supabase.from('xp_history').insert({
    user_id,
    date:           today,
    type:           'minigame',
    amount:         earnedXp,
    reason:         `ミニゲーム（ランク${rank}）`,
    total_xp_after: newTotal,
    level:          newLevel,
  });
  throwIfError(hisErr, 'saveMinigameResult:xp_history');

  // --- 本日プレイ回数の再集計 ---
  const status = await fetchMinigameStatusApi(user_id);

  return {
    saved:       true,
    earnedXp,
    totalXp:     newTotal,
    level:       newLevel,
    leveledUp:   newLevel > prevLevel,
    todayPlayed: status.todayPlayed,
    remaining:   status.remaining,
    locked:      status.locked,
    averageTime,
    rank,
  };
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

/**
 * 公開API: 道場内ランキング（最速TOP10＋平均TOP10＋推移グラフ用データ）を取得
 * -------------------------------------------------------------------
 * minigame_scores 全件から、ユーザーごとに以下を集計する。
 *   1. 最速タイム (topBest)    … average_time の最小値（昇順TOP10）
 *   2. 平均タイム (topAverage) … average_time の平均値（合計÷回数・昇順TOP10）
 * ★【重要】いずれの集計でも average_time <= 0 のバグデータは完全に除外する。
 *   除外は SQL 側（.gt('average_time', 0)）に加え、
 *   集計ループ内でも二重に防御する（保険）。
 * 推移グラフ（history.series）は「最速タイム上位プレイヤー」を基準に組み立てる。
 * 誰でも閲覧可能。
 */
export async function fetchMinigameRanking(): Promise<MinigameRankingResponse> {
  // 直近7日分のスコア（推移グラフ用）+ 全期間ベスト/平均（TOP用）
  const since7 = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [scoresRes, usersRes] = await Promise.all([
    supabase
      .from('minigame_scores')
      .select('user_id, created_at, average_time')
      .order('created_at', { ascending: true }),
    supabase.from('users').select('id, name').eq('role', 'student'),
  ]);

  throwIfError(scoresRes.error, 'fetchMinigameRanking:scores');
  throwIfError(usersRes.error, 'fetchMinigameRanking:users');

  const nameMap = new Map(
    (usersRes.data ?? []).map((u) => [u.id, u.name]),
  );

  // --- ユーザーごとに「最速(最小値)」「合計」「有効件数」を同時集計 ---
  // ★ average_time <= 0 のバグデータはここでも明示的にスキップする（二重防御）。
  const bestByUser = new Map<string, number>();      // 最速タイム（最小値）
  const sumByUser  = new Map<string, number>();      // 合計タイム（平均算出用）
  const countByUser = new Map<string, number>();     // 有効プレイ回数

  for (const s of scoresRes.data ?? []) {
    const t = s.average_time;
    // ★ 0以下のバグデータは集計に含めない（最速・平均ともに除外）。
    if (t == null || t <= 0) continue;

    // 最速（最小値）
    const curBest = bestByUser.get(s.user_id);
    if (curBest == null || t < curBest) {
      bestByUser.set(s.user_id, t);
    }
    // 合計・件数（平均算出用）
    sumByUser.set(s.user_id, (sumByUser.get(s.user_id) ?? 0) + t);
    countByUser.set(s.user_id, (countByUser.get(s.user_id) ?? 0) + 1);
  }

  // --- 最速タイム ランキング（topBest・昇順TOP10） ---
  const topBest: MinigameRankingEntry[] = Array.from(bestByUser.entries())
    .map(([userId, bestTimeMs]) => ({
      userId,
      name:       nameMap.get(userId) ?? userId,
      bestTimeMs,
      playCount:  countByUser.get(userId) ?? 0,
    }))
    .sort((a, b) => a.bestTimeMs - b.bestTimeMs)
    .slice(0, 10);

  // --- 平均タイム ランキング（topAverage・昇順TOP10） ---
  // ★ 平均 = 合計 ÷ 有効プレイ回数（0以下は既に除外済み）。
  //   四捨五入して ms 単位の整数にそろえ、formatTime と整合させる。
  const topAverage: MinigameRankingEntry[] = Array.from(countByUser.entries())
    .filter(([, count]) => count > 0) // 有効プレイが1回以上ある人のみ
    .map(([userId, count]) => {
      const sum = sumByUser.get(userId) ?? 0;
      const avg = Math.round(sum / count);
      return {
        userId,
        name:       nameMap.get(userId) ?? userId,
        bestTimeMs: avg, // ★ ここには「平均タイム」を格納（フィールド名は互換維持）
        playCount:  count,
      };
    })
    .sort((a, b) => a.bestTimeMs - b.bestTimeMs)
    .slice(0, 10);

  // --- 直近7日の日付ラベル（MM-dd・古い→新しい） ---
  const dates: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    dates.push(`${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }

  // --- 推移グラフ: 最速タイム上位（topBest）プレイヤーの日別ベスト推移 ---
  const series: MinigameRankingSeries[] = topBest.map((entry) => {
    const byDate = new Map<string, number>();
    for (const s of scoresRes.data ?? []) {
      if (s.user_id !== entry.userId) continue;
      // ★ グラフでも 0以下のバグデータは除外する。
      if (s.average_time == null || s.average_time <= 0) continue;
      const day = String(s.created_at).slice(0, 10);
      if (day < since7) continue;
      const label = `${day.slice(5, 7)}-${day.slice(8, 10)}`;
      const cur = byDate.get(label);
      if (cur == null || s.average_time < cur) {
        byDate.set(label, s.average_time);
      }
    }
    return {
      userId: entry.userId,
      name:   entry.name,
      points: dates.map((d) => byDate.get(d) ?? null),
    };
  });

  return {
    topBest,
    topAverage,
    history: { dates, series },
  };
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
    fetchMinigameRanking,
    {
      ...SWR_BASE_CONFIG,
      dedupingInterval: SWR_DEDUP.TEACHER_LIST,
    },
  );
}

// =====================================================================
// ★★★ Phase 7: あいことば（パスコード）変更API ★★★
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
 * 内部API: users.passcode を update する
 */
export async function updateUserPasscodeApi(
  payload: {
    user_id: string;
    new_passcode: string;
    current_passcode?: string;
  },
): Promise<UpdatePasscodeResponse> {
  const { user_id, new_passcode, current_passcode } = payload;

  // current_passcode が指定された場合は現在値を照合
  if (current_passcode !== undefined) {
    const { data: cur, error: selErr } = await supabase
      .from('users')
      .select('passcode')
      .eq('id', user_id)
      .single();
    throwIfError(selErr, 'updatePasscode:select');
    if (!cur || cur.passcode !== current_passcode) {
      throw new Error('いまのあいことばが正しくありません');
    }
  }

  const { data, error } = await supabase
    .from('users')
    .update({ passcode: new_passcode })
    .eq('id', user_id)
    .select('id, name')
    .single();
  throwIfError(error, 'updatePasscode:update');

  if (!data) {
    throw new Error('ユーザーが見つかりません');
  }

  return {
    updated: true,
    user_id: data.id,
    name:    data.name,
    message: 'あいことばを変更しました',
  };
}

// =====================================================================
// 先生用: 課題マスター（task_master）の更新ラッパー
// 子供向け仕様では生徒は課題を作れないため、生徒呼び出しは no-op とする。
// 既存インターフェース updateTasks を維持しつつ Supabase 化。
// =====================================================================
export interface UpdateTasksResult {
  updated: boolean;
  count:   number;
  message: string;
}

export async function updateTasks(
  tasks: Array<{
    id:            string;
    task_text:     string;
    display_order: number;
    grade_min:     number;
  }>,
): Promise<UpdateTasksResult> {
  const me = getAuthUser();

  // 生徒は課題を編集できない仕様 → no-op で安全に返す
  if (!me || me.role !== 'teacher') {
    return {
      updated: false,
      count:   0,
      message: '課題の編集は先生のみ可能です',
    };
  }

  if (!Array.isArray(tasks) || tasks.length === 0) {
    return { updated: false, count: 0, message: '更新する課題がありません' };
  }

  const rows = tasks.map((t) => ({
    id:            t.id,
    task_text:     t.task_text,
    display_order: t.display_order,
    grade_min:     t.grade_min,
  }));

  const { error } = await supabase
    .from('task_master')
    .upsert(rows, { onConflict: 'id' });
  throwIfError(error, 'updateTasks:upsert');

  return {
    updated: true,
    count:   rows.length,
    message: '課題を更新しました',
  };
}

/**
 * 公開ラッパー: あいことばを変更する
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
    user_id:      id,
    new_passcode: next,
  });
}

// =====================================================================
// ★★★ Phase 8: 「なかま」機能（門下生一覧＋応援システム）API ★★★
// =====================================================================

/**
 * なかま1人分のエントリ
 * ★ プライバシー保護のため、公開するのは
 * 名前 / 称号 / レベル / 合計XP / 最終稽古日 のみ。
 * 自己評価・先生評価・コメント・弱点等は一切含めない。
 */
export interface NakamaEntry {
  user_id:            string;
  name:               string;
  grade?:             string;
  level:              number;
  total_xp:           number;
  title:              string;           // 称号（titleForLevel で導出）
  last_practice_date: string | null;
  /** 何日前に稽古したか（燃え盛り判定用・null は記録なし） */
  daysSinceLastPractice: number | null;
  /** 最終稽古日から3日以内なら true（燃えているアピール用） */
  isBurning:          boolean;
  /** 本日、自分がこのなかまを既に応援済みか（1日1回制限用） */
  cheeredTodayByMe:   boolean;
}

/**
 * なかま一覧レスポンス
 */
export interface NakamaListResponse {
  /** 自分以外の門下生一覧（合計XP降順） */
  nakama:      NakamaEntry[];
  /** 自分が本日応援した人数（参考表示用） */
  cheeredToday: number;
}

/**
 * 応援アクションのレスポンス
 */
export interface CheerResponse {
  /** 応援が成立したか */
  cheered:        boolean;
  /** 応援した相手のID */
  to_user_id:     string;
  /** 応援した相手の名前 */
  to_user_name:   string;
  /** 自分（応援した側）が得たXP */
  my_xp_gained:   number;
  /** 相手（応援された側）が得たXP */
  their_xp_gained: number;
  /** 1回の応援で付与されるXP（5固定） */
  cheer_xp:       number;
  /** メッセージ（成功・スキップ理由など） */
  message:        string;
}

/** 応援1回で双方に付与されるXP */
const CHEER_XP = 5;

/**
 * 内部API: なかま一覧を取得して組み立てる
 * -------------------------------------------------------------------
 * ・自分以外の生徒（role = 'student'）を取得
 * ・user_status から レベル・合計XP・最終稽古日 を結合
 * ・title_master から 称号 を導出
 * ・本日自分が応援済みの相手（cheer_logs）を結合
 * ★ プライベートな稽古内容（課題・技・評価・コメント）は一切取得しない。
 */
export async function fetchNakamaListApi(
  myUserId: string,
): Promise<NakamaListResponse> {
  if (!myUserId) {
    throw new Error('user_id が指定されていません');
  }

  // 本日（JST）の範囲を算出（応援の1日1回判定用）。
  const { startIso, endIso } = resolveDayRange(undefined);

  const [studentsRes, statusRes, titleRes, myCheersTodayRes] = await Promise.all([
    // ★ 自分以外の門下生（公開情報のみ）
    supabase
      .from('users')
      .select('id, name, grade')
      .eq('role', 'student')
      .neq('id', myUserId),
    // ステータス（全生徒分・後でMap結合）
    supabase
      .from('user_status')
      .select('user_id, total_xp, level, last_practice_date'),
    // 称号マスター
    supabase
      .from('title_master')
      .select('level, title')
      .order('level', { ascending: true }),
    // ★ 本日、自分が応援した相手（1日1回制限の判定用）
    supabase
      .from('cheer_logs')
      .select('to_user_id')
      .eq('from_user_id', myUserId)
      .gte('cheered_at', startIso)
      .lt('cheered_at', endIso),
  ]);

  throwIfError(studentsRes.error, 'fetchNakamaList:students');
  throwIfError(statusRes.error, 'fetchNakamaList:user_status');
  throwIfError(titleRes.error, 'fetchNakamaList:title_master');
  throwIfError(myCheersTodayRes.error, 'fetchNakamaList:my_cheers_today');

  const titleMaster: TitleMasterEntry[] = (titleRes.data ?? []).map((t) => ({
    level: t.level,
    title: t.title,
  }));

  const statusMap = new Map(
    (statusRes.data ?? []).map((s) => [s.user_id, s]),
  );

  // 本日、自分が応援済みの相手IDセット
  const cheeredSet = new Set(
    (myCheersTodayRes.data ?? []).map((c) => c.to_user_id),
  );

  const now = Date.now();
  const nakama: NakamaEntry[] = (studentsRes.data ?? []).map((u) => {
    const st = statusMap.get(u.id);
    const last = st?.last_practice_date ?? null;
    const level = st?.level ?? 1;
    const totalXp = st?.total_xp ?? 0;

    // 最終稽古日からの経過日数（燃え盛り判定）。
    const days =
      last != null
        ? Math.floor((now - new Date(last).getTime()) / (24 * 60 * 60 * 1000))
        : null;
    // 3日以内なら「燃えている」。
    const isBurning = days != null && days <= 3;

    return {
      user_id:               u.id,
      name:                  u.name,
      grade:                 u.grade != null ? String(u.grade) : undefined,
      level,
      total_xp:              totalXp,
      title:                 titleForLevel(level, titleMaster),
      last_practice_date:    last,
      daysSinceLastPractice: days,
      isBurning,
      cheeredTodayByMe:      cheeredSet.has(u.id),
    };
  });

  // 合計XP降順で並べる（強い剣士が上位）。
  nakama.sort((a, b) => b.total_xp - a.total_xp);

  return {
    nakama,
    cheeredToday: cheeredSet.size,
  };
}

/**
 * 公開ラッパー: ログイン中の生徒IDを内部で付与してなかま一覧を取得
 */
export async function fetchNakamaList(): Promise<NakamaListResponse> {
  const me = getAuthUser();
  if (!me || me.role !== 'student') {
    throw new Error('門下生としてログインしていません');
  }
  return fetchNakamaListApi(me.id);
}

/**
 * 内部API: 応援を実行する
 * -------------------------------------------------------------------
 * ・1日1回制限: 同一相手への当日の応援が既にあればスキップ。
 * ・cheer_logs に記録。
 * ・応援した側（自分）と応援された側（相手）の両方に CHEER_XP を付与。
 * ・xp_history に双方の履歴（type='cheer'）を残す。
 */
export async function cheerStudentApi(
  payload: {
    from_user_id: string;
    to_user_id:   string;
  },
): Promise<CheerResponse> {
  const { from_user_id, to_user_id } = payload;

  // --- 自分自身への応援は禁止 ---
  if (from_user_id === to_user_id) {
    throw new Error('自分自身は応援できません');
  }

  // --- 相手の存在確認（名前取得も兼ねる） ---
  const { data: toUser, error: toErr } = await supabase
    .from('users')
    .select('id, name, role')
    .eq('id', to_user_id)
    .single();
  throwIfError(toErr, 'cheerStudent:to_user');
  if (!toUser || toUser.role !== 'student') {
    throw new Error('応援できる相手が見つかりません');
  }

  // --- ★ 1日1回制限: 本日（JST）すでに同じ相手を応援済みかチェック ---
  const { startIso, endIso } = resolveDayRange(undefined);
  const { data: existing, error: exErr } = await supabase
    .from('cheer_logs')
    .select('id')
    .eq('from_user_id', from_user_id)
    .eq('to_user_id', to_user_id)
    .gte('cheered_at', startIso)
    .lt('cheered_at', endIso)
    .limit(1);
  throwIfError(exErr, 'cheerStudent:existing');

  if (existing && existing.length > 0) {
    // すでに応援済み → XP付与せずスキップ。
    return {
      cheered:         false,
      to_user_id,
      to_user_name:    toUser.name,
      my_xp_gained:    0,
      their_xp_gained: 0,
      cheer_xp:        CHEER_XP,
      message:         `${toUser.name}は今日もう応援したよ！また明日応援しよう🔥`,
    };
  }

  // --- 応援ログを記録 ---
  const nowIso = new Date().toISOString();
  const { error: insErr } = await supabase.from('cheer_logs').insert({
    from_user_id,
    to_user_id,
    cheered_at: nowIso,
  });
  throwIfError(insErr, 'cheerStudent:insert');

  // --- 双方のXPを加算するヘルパー（user_status の upsert ＋ xp_history 追記） ---
  // 応援した側・された側で reason を変えて履歴に残す。
  async function grantCheerXp(
    userId: string,
    reason: string,
  ): Promise<void> {
    const { data: st, error: stErr } = await supabase
      .from('user_status')
      .select('total_xp')
      .eq('user_id', userId)
      .maybeSingle();
    throwIfError(stErr, 'cheerStudent:user_status.select');

    const newTotal = (st?.total_xp ?? 0) + CHEER_XP;
    const newLevel = calcLevelFromXp(newTotal);

    const { error: updErr } = await supabase
      .from('user_status')
      .upsert(
        {
          user_id:  userId,
          total_xp: newTotal,
          level:    newLevel,
        },
        { onConflict: 'user_id' },
      );
    throwIfError(updErr, 'cheerStudent:user_status.upsert');

    const { error: hisErr } = await supabase.from('xp_history').insert({
      user_id:        userId,
      date:           nowIso,
      type:           'cheer',
      amount:         CHEER_XP,
      reason,
      total_xp_after: newTotal,
      level:          newLevel,
    });
    throwIfError(hisErr, 'cheerStudent:xp_history');
  }

  // --- 自分（応援した側）の名前を取得して履歴 reason に使う ---
  const { data: fromUser } = await supabase
    .from('users')
    .select('name')
    .eq('id', from_user_id)
    .single();
  const fromName = fromUser?.name ?? from_user_id;

  // --- 双方にXP付与（応援した側 → された側 の順）---
  await grantCheerXp(from_user_id, `${toUser.name}を応援した`);
  await grantCheerXp(to_user_id, `${fromName}から応援された`);

  return {
    cheered:         true,
    to_user_id,
    to_user_name:    toUser.name,
    my_xp_gained:    CHEER_XP,
    their_xp_gained: CHEER_XP,
    cheer_xp:        CHEER_XP,
    message:         `${toUser.name}を応援した！おたがい ${CHEER_XP} XP ゲット🔥`,
  };
}

/**
 * 公開ラッパー: ログイン中の生徒IDを内部で付与して応援を実行する
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
    to_user_id:   target,
  });
}

// =====================================================================
// SWRフック: なかま一覧（任意・10秒キャッシュ）
// 応援後に mutate して即時反映する。
// =====================================================================
export function useNakamaListSWR(): SWRResponse<NakamaListResponse, Error> {
  const me = typeof window !== 'undefined' ? getAuthUser() : null;
  const key = me?.role === 'student'
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
