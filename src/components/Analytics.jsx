import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts';
import { useApp } from '../App.jsx';
import { STAGES } from '../data/applications.js';
import { computeCommScore, getScoreColor, computeHealthGrade, getHealthGradeNarrative, daysSince } from '../utils/scoring.js';

const STAGE_COLORS = {
  'Targeting': '#6b7280',
  'Applied': '#3b82f6',
  'Recruiter Screen': '#8b5cf6',
  'Assessment': '#f59e0b',
  'First Interview': '#06b6d4',
  'Final Round': '#f97316',
  'Offer Received': '#10b981',
  'Closed': '#ef4444',
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 6, padding: '6px 10px', fontSize: 12,
    }}>
      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{label}</div>
      <div style={{ color: 'var(--text-secondary)' }}>{payload[0].value} apps</div>
    </div>
  );
};

export default function Analytics() {
  const { state } = useApp();
  const { applications } = state;

  const active = applications.filter((a) => a.stage !== 'Closed');
  const closed = applications.filter((a) => a.stage === 'Closed');
  const grade = computeHealthGrade(active);
  const narrative = getHealthGradeNarrative(grade);

  // Pipeline funnel data
  const funnelData = STAGES.filter((s) => s !== 'Closed').map((stage) => ({
    stage,
    count: applications.filter((a) => a.stage === stage).length,
  }));

  // Conversion rates
  const advancedStages = ['Recruiter Screen', 'Assessment', 'First Interview', 'Final Round', 'Offer Received'];
  const advanced = applications.filter((a) => advancedStages.includes(a.stage)).length;
  const total = applications.filter((a) => a.stage !== 'Closed').length;
  const responseRate = total > 0 ? Math.round((advanced / total) * 100) : 0;
  const avgDaysInStage = total > 0
    ? Math.round(active.reduce((acc, a) => acc + daysSince(a.stageEnteredAt), 0) / active.length)
    : 0;

  const rejections = applications.filter((a) => a.status === 'REJECTED').length;
  const rejectionRate = applications.length > 0 ? Math.round((rejections / applications.length) * 100) : 0;

  // Score distribution
  const scores = applications.map((a) => computeCommScore(a).score);
  const scoreGroups = {
    green: scores.filter((s) => s >= 8).length,
    amber: scores.filter((s) => s >= 5 && s < 8).length,
    red: scores.filter((s) => s < 5).length,
  };

  const pieData = [
    { name: 'Strong (8–10)', value: scoreGroups.green, color: '#10b981' },
    { name: 'Moderate (5–7)', value: scoreGroups.amber, color: '#f59e0b' },
    { name: 'Weak (<5)', value: scoreGroups.red, color: '#ef4444' },
  ].filter((d) => d.value > 0);

  const donutData = [
    { name: 'Active', value: active.length, color: '#3b82f6' },
    { name: 'Closed', value: closed.length, color: '#6b7280' },
  ];

  return (
    <div className="analytics">
      {/* Top row: Health + Stats */}
      <div className="analytics__top">
        <div className="analytics__section">
          <div className="analytics__section-title">Pipeline Health</div>
          <div className="health-grade-display">
            <div className={`health-grade-letter health-grade-letter--${grade}`}>{grade}</div>
            <div className="health-grade-narrative">{narrative}</div>
          </div>
        </div>

        <div className="analytics__section">
          <div className="analytics__section-title">Key Metrics</div>
          <div className="conversion-grid">
            <div className="conversion-stat">
              <div className="conversion-stat__value">{applications.length}</div>
              <div className="conversion-stat__label">Total Apps</div>
            </div>
            <div className="conversion-stat">
              <div className="conversion-stat__value">{active.length}</div>
              <div className="conversion-stat__label">Active</div>
            </div>
            <div className="conversion-stat">
              <div className="conversion-stat__value" style={{ color: 'var(--green)' }}>{responseRate}%</div>
              <div className="conversion-stat__label">Response Rate</div>
            </div>
            <div className="conversion-stat">
              <div className="conversion-stat__value">{advanced}</div>
              <div className="conversion-stat__label">Advanced</div>
            </div>
            <div className="conversion-stat">
              <div className="conversion-stat__value">{avgDaysInStage}d</div>
              <div className="conversion-stat__label">Avg Days in Stage</div>
            </div>
            <div className="conversion-stat">
              <div className="conversion-stat__value" style={{ color: 'var(--red)' }}>{rejectionRate}%</div>
              <div className="conversion-stat__label">Rejection Rate</div>
            </div>
          </div>
        </div>
      </div>

      {/* Pipeline Funnel */}
      <div className="analytics__section" style={{ marginBottom: 16 }}>
        <div className="analytics__section-title">Pipeline Funnel</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={funnelData} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 0 }}>
            <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis
              type="category"
              dataKey="stage"
              tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={110}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {funnelData.map((entry) => (
                <Cell key={entry.stage} fill={STAGE_COLORS[entry.stage] || '#6b7280'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Charts row */}
      <div className="analytics__grid">
        <div className="analytics__section">
          <div className="analytics__section-title">Comm Score Distribution</div>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={70}
                  dataKey="value"
                  paddingAngle={2}
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val, name) => [`${val} apps`, name]}
                  contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: 16 }}>No data</div>
          )}
        </div>

        <div className="analytics__section">
          <div className="analytics__section-title">Active vs Closed</div>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={donutData}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={70}
                dataKey="value"
                paddingAngle={2}
              >
                {donutData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(val, name) => [`${val} apps`, name]}
                contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
