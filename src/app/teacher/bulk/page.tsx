// src/app/teacher/bulk/page.tsx
'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useMyTeacherDashboardSWR, evaluateBulkStudents } from '@/lib/api';
import { calcTeacherTaskXp } from '@/types';
import TeacherTaskRater from '@/components/TeacherTaskRater';

export default function TeacherBulkPage() {
  const router = useRouter();
  const { data, isLoading } = useMyTeacherDashboardSWR();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [taskScores, setTaskScores] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);

  const toggleAll = () => {
    if (selectedIds.size === data?.students.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(data?.students.map(s => s.user_id)));
  };

  const handleSubmit = async () => {
    if (submitting || selectedIds.size === 0) return;
    setSubmitting(true);
    try {
      const evaluations = Object.entries(taskScores)
        .filter(([, s]) => s > 0)
        .map(([task_id, score]) => ({ task_id, score }));

      await evaluateBulkStudents({
        student_ids: Array.from(selectedIds),
        evaluations,
      });
      router.replace('/teacher');
    } catch (e) {
      alert('評価に失敗しました');
      setSubmitting(false);
    }
  };

  // プレビュー表示（個別:10倍 → 全体:5倍）
  const totalXp = useMemo(() => {
    const xp = Object.values(taskScores).reduce((sum, s) => sum + calcTeacherTaskXp(s), 0);
    return Math.floor(xp * 0.5); // 10倍の半分＝5倍
  }, [taskScores]);

  if (isLoading || !data) return <div>読み込み中...</div>;

  return (
    <div style={{ padding: '20px', color: '#fff' }}>
      <h1>全体評価</h1>
      <button onClick={toggleAll}>全員選択/解除</button>
      
      {data.students.map(s => (
        <label key={s.user_id}>
          <input 
            type="checkbox" 
            checked={selectedIds.has(s.user_id)} 
            onChange={() => {
              const next = new Set(selectedIds);
              next.has(s.user_id) ? next.delete(s.user_id) : next.add(s.user_id);
              setSelectedIds(next);
            }} 
          />
          {s.name}
        </label>
      ))}

      {/* 課題評価Raterは個別画面と同様のものをループ */}
      {/* ... TaskRater実装 ... */}

      <button onClick={handleSubmit} disabled={submitting || selectedIds.size === 0}>
        全員に送信（計 {totalXp} XP付与）
      </button>
    </div>
  );
}
