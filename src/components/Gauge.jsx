export default function Gauge({
  value,
  min = 0,
  max = 100,
  unit = '%',
  label,
  size = 148,
  color = '#22d3ee',
  warnLow = null,
  warnHigh = null,
}) {
  const ready = value != null
  const pct = ready ? ((Math.min(Math.max(value, min), max) - min) / (max - min)) * 100 : 0
  const clamped = Math.min(100, Math.max(0, pct))
  const R = size / 2 - 14
  const C = 2 * Math.PI * R
  const offset = C * (1 - clamped / 100)

  let tone = ready ? color : '#334155'
  if (ready && warnLow != null && value < warnLow) tone = '#f43f5e'
  if (ready && warnHigh != null && value > warnHigh) tone = '#f59e0b'

  const ticks = []
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI + (Math.PI * i) / 10
    ticks.push({
      x1: size / 2 + Math.cos(a) * (R + 4),
      y1: size / 2 + Math.sin(a) * (R + 4),
      x2: size / 2 + Math.cos(a) * (R + 10),
      y2: size / 2 + Math.sin(a) * (R + 10),
    })
  }

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: 'rgba(255,255,255,0.02)',
        }}
      />
      <svg className="absolute inset-0" width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={R}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="11"
        />
        <g stroke="rgba(255,255,255,0.14)" strokeWidth="1">
          {ticks.map((t, i) => (
            <line key={i} {...t} />
          ))}
        </g>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={R}
          fill="none"
          stroke={tone}
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={offset}
          transform={`rotate(180 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1), stroke 0.4s' }}
        />
        <circle cx={size / 2} cy={size / 2} r={R - 16} fill="rgba(255,255,255,0.015)" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-2xl font-bold tabular-nums leading-none" style={{ color: tone }}>
          {ready ? value : '—'}
          {ready && unit && <span className="ml-0.5 text-xs font-semibold" style={{ color: '#94a3b8' }}>{unit}</span>}
        </span>
        <span className="mt-1 text-[9px] uppercase tracking-widest" style={{ color: '#64748b' }}>{label}</span>
      </div>
    </div>
  )
}
