// src/lib/auth.ts
// =====================================================================
// 燃えろ剣士 - 認証状態管理
// localStorage でログイン情報を保持し、各ページから簡単に参照可能にする
// ログアウト時はSWR永続化キャッシュも完全消去する
// =====================================================================

import { clearPersistedCache } from './swrCache';
import type { User, UserRole } from '@/types';

const AUTH_KEY = 'burning_swordman_user';

// =====================================================================
// 型定義
// =====================================================================
export interface AuthUser {
  id:        string;
  name:      string;
  role:      UserRole;
  grade?:    string;
  loginAt:   string; // ISO8601
}

// =====================================================================
// localStorage 安全アクセス
// =====================================================================
function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

// =====================================================================
// 取得・保存・削除
// =====================================================================
export function getAuthUser(): AuthUser | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw) as AuthUser;
    if (!user.id || !user.role) return null;
    return user;
  } catch {
    return null;
  }
}

export function saveAuthUser(user: User): AuthUser {
  const authUser: AuthUser = {
    id:      user.id,
    name:    user.name,
    role:    user.role,
    grade:   user.grade,
    loginAt: new Date().toISOString(),
  };
  if (isBrowser()) {
    try {
      localStorage.setItem(AUTH_KEY, JSON.stringify(authUser));
    } catch (err) {
      console.warn('[auth] 保存失敗:', err);
    }
  }
  return authUser;
}

export function clearAuthUser(): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(AUTH_KEY);
  } catch (err) {
    console.warn('[auth] 削除失敗:', err);
  }
}

// =====================================================================
// ヘルパー：ログイン状態判定
// =====================================================================
export function isLoggedIn(): boolean {
  return getAuthUser() !== null;
}

export function isStudent(): boolean {
  const u = getAuthUser();
  return u?.role === 'student';
}

export function isTeacher(): boolean {
  const u = getAuthUser();
  return u?.role === 'teacher';
}

// =====================================================================
// ログアウト処理（最重要）
// 順序保証：
//  1. SWR永続化キャッシュ削除（前ユーザーのデータ漏洩防止）
//  2. localStorage の認証情報削除
//  3. ログイン画面へリダイレクト
// =====================================================================
export function logoutAndRedirect(redirectPath: string = '/login'): void {
  // 1. SWR永続化キャッシュを必ず先に消去
  clearPersistedCache();

  // 2. 認証情報を消去
  clearAuthUser();

  // 3. リダイレクト（ブラウザ内のSWRメモリキャッシュも window.location 遷移で完全リセット）
  if (isBrowser()) {
    window.location.href = redirectPath;
  }
}

// =====================================================================
// ロール別 期待されるホームパス
// =====================================================================
export function getHomePathForRole(role: UserRole): string {
  switch (role) {
    case 'teacher': return '/teacher';
    case 'student': return '/';
    default:        return '/login';
  }
}

// =====================================================================
// 認証ガード（クライアントコンポーネント用）
// useEffect 内で呼び、未ログインなら /login へ、ロール不一致なら適切な画面へ飛ばす
// =====================================================================
export function requireAuth(expectedRole?: UserRole): AuthUser | null {
  const user = getAuthUser();
  if (!user) {
    if (isBrowser()) window.location.href = '/login';
    return null;
  }
  if (expectedRole && user.role !== expectedRole) {
    if (isBrowser()) window.location.href = getHomePathForRole(user.role);
    return null;
  }
  return user;
}
