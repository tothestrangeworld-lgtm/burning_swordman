// src/components/XpTimelineChart.tsx
// =====================================================================
// 燃えよ剣士 - 経験値の推移
// 百錬自得のサイバーネオン版を「白×臙脂」の和風ヒロイック版にリメイク
// =====================================================================

'use client';

import { useState, useEffect } from 'react';
import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { XpHistoryEntry } from '@/types';
import { THEME } from '@/types';

interface Props {
  xpHistory?: XpHistoryEntry[];
  compact?:   boolean;
}

function toDisplayDate(dateStr: string): string {
  const d = dateStr.slice(0, 10);
  const parts = d.split('-');
  if (parts.length < 3) return dateStr;
  return `${parseInt(parts[1])}/${parts[2]}`;
}

function buildXTicks(data: XpHistoryEntry[]): string[] {
  const seen = new Set<string>();
  return data
    .map(e => toDisplayDate(e.date))
    .filter(label => {
      if (!label.endsWith('/01')) return false;
      if (seen.has(label)) return false;
      seen.add(label);
      return true;
    });
}

const TYPE_LABEL: Record<string, string> = {
  gain:         '稽古で獲得',
  decay:        'サボり減衰',
  teacher_eval: '先生評価！',
  minigame:     'ミニゲーム',
  reset:        'リセット',
};

interface PayloadItem {
  payload?: {
    type?:   string;
    reason?: string;
    level?:  number;
    amount?: number;
  };
  value?: number;
}

function CustomTooltip({
  active, payload, label,
}: {
  active?: boolean;
  payload?: PayloadItem[];
  label?:  string;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const xp   = item.value ?? 0;
  const { type, reason, level, amount } = item.payload ?? {};
  const typeLabel = TYPE_LABEL[type ?? ''] ?? type ?? '';
  const sign      = (amount ?? 0) >= 0 ? '+' : '';
  const amtColor  = (amount ?? 0) >= 0 ? '#1E7C3A' : THEME.primary;

  return (
    <div style={{
      background:   '#FFFFFF',
      border:       `2px solid ${THEME.primary}`,
      borderRadius: 10,
      color:        THEME.text,
      fontSize:     12,
      padding:      '10px 14px',
      lineHeight:   1.7,
      boxShadow:    '0 4px 12px rgba(178,34,34,0.2)',
    }}>
      <div style={{ color: THEME.textMuted, marginBottom: 2, fontSize: 11 }}>{label}</div>
      <div style={{
        color:           '#FFFFFF',
        backgroundColor: THEME.primary,
        display:         'inline-block',
        padding:         '1px 8px',
        borderRadius:    4,
        fontSize:        10,
        fontWeight:      700,
        marginBottom:    4,
      }}>{typeLabel}</div>
      {amount !== undefined && (
        <div style={{ color: amtColor, fontWeight: 800, fontSize: 14 }}>
          {sign}{amount?.toLocaleString()} XP
        </div>
      )}
      <div style={{ color: THEME.primaryDark, fontWeight: 800 }}>
        累計 {xp.toLocaleString()} XP
      </div>
      {level !== undefined && level > 0 && (
        <div style={{ color: THEME.textMuted, fontSize: 11 }}>
          修行度 Lv.{level}
        </div>
      )}
      {reason && (
        <div style={{ color: THEME.textMuted, fontSize: 10, marginTop: 4, maxWidth: 200 }}>
          {reason}
        </div>
      )}
    </div>
  );
}

interface DotProps {
  cx?: number;
  cy?: number;
  payload?: { type?: string };
}
function CustomDot({ cx, cy, payload }: DotProps) {
  if (cx === undefined || cy === undefined) return null;
  const type = payload?.type ?? '';

  if (type === 'decay') {
    return (
      <circle cx={cx} cy={cy} r={3.5}
        fill="#999" stroke="rgba(150,150,150,0.3)" strokeWidth={4} />
    );
  }
  if (type === 'teacher_eval') {
    // 先生評価は金色キラキラ
    return (
      <g>
        <circle cx={cx} cy={cy} r={5}
          fill={THEME.accent} stroke="rgba(255,215,0,0.4)" strokeWidth={5} />
        <circle cx={cx} cy={cy} r={2}
          fill="#FFFFFF" />
      </g>
    );
  }
  if (type === 'minigame') {
    return (
      <circle cx={cx} cy={cy} r={3.5}
        fill="#1E7C3A" stroke="rgba(30,124,58,0.3)" strokeWidth={4} />
    );
  }
  // gain（通常）
  return (
    <circle cx={cx} cy={cy} r={2.5}
      fill={THEME.primary} stroke="transparent" strokeWidth={0} />
  );
}

export default function XpTimelineChart({ xpHistory = [], compact = false }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return null;

  if (!xpHistory.length) {
    return (
      <div style={{
        textAlign: 'center', padding: '2rem 1rem',
        color: THEME.textMuted, fontSize: '13px',
      }}>
        ⚔️ 稽古を記録すると、修行値の推移がここに表示されるぞ！
      </div>
    );
  }

  const maxXP  = Math.max(...xpHistory.map(e => e.total_xp_after));
  const height = compact ? 180 : 240;
  const xTicks = buildXTicks(xpHistory);

  const chartData = xpHistory.map(e => ({
    label:          toDisplayDate(e.date),
    total_xp_after: Math.max(0, e.total_xp_after),
    amount:         e.amount,
    type:           e.type,
    reason:         e.reason,
    level:          e.level,
  }));

  const gradId = compact ? 'burningXpGradC' : 'burningXpGradF';

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 14, right: 12, left: -16, bottom: 36 }}>
          <defs>
            {/* 臙脂→ゴールドの和風グラデーション */}
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={THEME.primary}   stopOpacity={0.55} />
              <stop offset="50%"  stopColor={THEME.primary}   stopOpacity={0.25} />
              <stop offset="100%" stopColor="#FFFFFF"         stopOpacity={0.05} />
            </linearGradient>
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(178,34,34,0.08)"
            vertical={false}
          />

          <XAxis
            dataKey="label"
            ticks={xTicks}
            tick={{ fontSize: 10, fill: THEME.textMuted, fontWeight: 700 }}
            tickLine={false}
            axisLine={{ stroke: THEME.border }}
            dy={6}
          />
          <YAxis
            tick={{ fontSize: 10, fill: THEME.textMuted, fontWeight: 700 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
          />

          <Tooltip content={<CustomTooltip />} />

          {/* 最高XPの基準線 */}
          <ReferenceLine
            y={maxXP}
            stroke={THEME.accent}
            strokeDasharray="4 4"
            strokeWidth={1.5}
            label={{
              value: `🏆 最高 ${maxXP.toLocaleString()}`,
              position: 'insideTopRight',
              fontSize: 10,
              fill: '#B8860B',
              fontWeight: 700,
            }}
          />

          {/* 階段状エリア（修行が積み上がる感） */}
          <Area
            type="stepAfter"
            dataKey="total_xp_after"
            stroke={THEME.primary}
            strokeWidth={compact ? 2 : 2.5}
            fill={`url(#${gradId})`}
            dot={<CustomDot />}
            activeDot={{
              r: 6,
              fill: THEME.primary,
              stroke: '#FFFFFF',
              strokeWidth: 2,
            }}
            style={{ filter: `drop-shadow(0 2px 4px rgba(178,34,34,0.25))` }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
