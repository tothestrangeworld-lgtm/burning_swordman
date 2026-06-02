// src/components/TaskCriteriaPanel.tsx
// =====================================================================
// 固定課題の合格基準チェックリスト（アコーディオン展開部）
// =====================================================================

'use client';

import { THEME } from '@/types';
import { TASK_CRITERIA } from '@/lib/taskCriteria';

interface Props {
  taskId:    string;
  expanded:  boolean;
}

export default function TaskCriteriaPanel({ taskId, expanded }: Props) {
  const criteria = TASK_CRITERIA[taskId];
  if (!criteria) return null;

  return (
    <div
      style={{
        ...panelStyles.wrapper,
        maxHeight: expanded ? '320px' : '0',
        opacity:   expanded ? 1 : 0,
        marginTop: expanded ? '10px' : '0',
        padding:   expanded ? '12px 14px' : '0 14px',
      }}
      aria-hidden={!expanded}
    >
      <div style={panelStyles.inner}>
        <div style={panelStyles.title}>{criteria.title}</div>
        <p style={panelStyles.subtitle}>合格基準（この3つを見て★をつけよう）</p>
        <ul style={panelStyles.list}>
          {criteria.checks.map((check, i) => (
            <li key={i} style={panelStyles.item}>
              <span style={panelStyles.checkIcon} aria-hidden="true">✓</span>
              <span style={panelStyles.checkText}>{check}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const panelStyles: Record<string, React.CSSProperties> = {
  wrapper: {
    overflow:      'hidden',
    transition:    'max-height 0.28s ease, opacity 0.22s ease, margin-top 0.22s ease, padding 0.22s ease',
    borderRadius:  '10px',
  },
  inner: {
    backgroundColor: THEME.bgSoft,
    border:          `1.5px solid ${THEME.border}`,
    borderRadius:    '10px',
    padding:         '12px 14px',
  },
  title: {
    fontSize:     '13px',
    fontWeight:   900,
    color:        THEME.primaryDark,
    marginBottom: '2px',
    letterSpacing: '0.03em',
  },
  subtitle: {
    margin:     '0 0 10px',
    fontSize:   '11px',
    fontWeight: 700,
    color:      THEME.textMuted,
  },
  list: {
    listStyle: 'none',
    margin:    0,
    padding:   0,
    display:   'flex',
    flexDirection: 'column',
    gap:       '10px',
  },
  item: {
    display:    'flex',
    alignItems: 'flex-start',
    gap:        '10px',
  },
  checkIcon: {
    flexShrink:      0,
    width:           '22px',
    height:          '22px',
    borderRadius:    '50%',
    backgroundColor: THEME.primary,
    color:           '#FFFFFF',
    fontSize:        '12px',
    fontWeight:      900,
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    marginTop:       '1px',
  },
  checkText: {
    fontSize:   '13px',
    fontWeight: 600,
    color:      THEME.text,
    lineHeight: 1.55,
    flex:       1,
  },
};
