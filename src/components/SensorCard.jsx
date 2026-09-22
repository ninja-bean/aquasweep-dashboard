function Sparkline({ data, color, width = 260, height = 40 }) {
  const pts = (data || []).length > 1
    ? (() => {
        const min = Math.min(...data)
        const max = Math.max(...data)
        const span = max - min || 1
        return data
          .map((v, i) => {
            const x = (i / (data.length - 1)) * width
            const y = height - ((v - min) / span) * (height - 4) - 2
            return `${x.toFixed(1)},${y.toFixed(1)}`
          })
          .join(' ')
      })()
    : null
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {pts && <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />}
    </svg>
  )
}

const TONE = {
  good: { color: '#34d399', label: 'Optimal' },
  warn: { color: '#fbbf24', label: 'Caution' },
  bad: { color: '#f43f5e', label: 'Critical' },
  na: { color: '#64748b', label: 'No data' },
}

export default function SensorCard({ icon, label, value, unit, sub, history, color, status = 'good', lastSync }) {
  const noData = value == null || value === '—'
  const s = noData ? TONE.na : TONE[status] ?? TONE.good

  return (
    <div className="glass group relative overflow-hidden rounded-2xl p-5 transition-transform duration-300 hover:-translate-y-1">
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full blur-3xl transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: `${color}22`, opacity: 0.6 }}
      />
      <div className="relative flex items-start justify-between">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-xl"
          style={{ background: `${color}1f`, color, border: `1px solid ${color}33` }}
        >
          {icon}
        </div>
        <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: s.color }}>
          <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: s.color }} />
          {s.label}
        </span>
      </div>

      <p className="relative mt-4 text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</p>
      <div className="relative mt-1 flex items-baseline gap-1">
        <span className="font-display text-3xl font-bold tabular-nums text-slate-100">{noData ? '—' : value}</span>
        {!noData && unit && <span className="text-sm font-medium text-slate-400">{unit}</span>}
      </div>
      <p className="relative mt-1 text-xs text-slate-500">{sub}</p>

      <div className={`relative mt-3 h-10 ${noData ? 'opacity-20' : 'opacity-80'}`}>
        <Sparkline data={history} color={color} />
      </div>

      <p className="relative mt-2 flex items-center gap-1 text-[10px] text-slate-600">
        <span className="inline-block h-1 w-1 animate-pulse rounded-full" style={{ background: color }} />
        Last sync {lastSync}
      </p>
    </div>
  )
}
