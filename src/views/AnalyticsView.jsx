import { useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar, ReferenceLine,
} from 'recharts'
import { TrendingUp, Calendar, Activity } from 'lucide-react'

const METRICS = {
  pH: { color: '#f43f5e', label: 'pH', unit: '', ref: 7.0 },
  temp: { color: '#fb923c', label: 'Temperature', unit: '°C', ref: 26 },
  turbidity: { color: '#eab308', label: 'Turbidity', unit: 'NTU', ref: 15 },
  oxygen: { color: '#34d399', label: 'Dissolved O₂', unit: 'mg/L', ref: 5.5 },
}

function GlassTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div className="z-50 rounded-xl border border-slate-700 bg-slate-900/95 p-4 shadow-2xl backdrop-blur-xl">
      <p className="mb-2 text-xs font-semibold text-slate-400">{label}</p>
      {payload.map((entry, index) => (
        <p key={index} className="font-mono text-sm" style={{ color: entry.color || '#22d3ee' }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  )
}

export default function AnalyticsView({ history }) {
  const [range, setRange] = useState('24h')
  const [metric, setMetric] = useState('pH')
  const m = METRICS[metric]
  const data = history

  return (
    <div className="animate-fade-up space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-200">Historical Analytics</h2>
          <p className="text-xs text-slate-500">Comparing current water quality against past trends</p>
        </div>
        <div className="flex items-center gap-2">
          {['6h', '24h', '7d', '30d'].map((r) => (
            <button key={r} onClick={() => setRange(r)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              range === r ? 'bg-aqua-500/20 text-aqua-300 ring-1 ring-aqua-400/40' : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
            }`}>{r}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Object.entries(METRICS).map(([k, v]) => {
          const cur = history[history.length - 1]?.[k]
          const prev = history[Math.max(0, history.length - 13)]?.[k]
          const has = cur != null && prev != null
          const delta = has ? cur - prev : null
          const good = delta != null && Math.abs(delta) < 0.6
          return (
            <div key={k} className="glass rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">{v.label}</p>
                <TrendingUp size={14} className={good ? 'text-emerald-400' : delta != null ? 'text-amber-400' : 'text-slate-600'} />
              </div>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums text-slate-100">
                {cur != null ? cur : '—'}
                {cur != null && <span className="ml-1 text-xs font-medium text-slate-500">{v.unit}</span>}
              </p>
              <p className={`mt-0.5 font-mono text-[11px] ${has ? (delta >= 0 ? 'text-emerald-400' : 'text-rose-400') : 'text-slate-600'}`}>
                {has ? `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(2)} vs 6h ago` : 'no data yet'}
              </p>
            </div>
          )
        })}
      </div>

      <div className="glass rounded-2xl p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-slate-200">
            <Activity size={15} className="text-aqua-300" /> {m.label} Trend — last {range}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(METRICS).map((k) => (
              <button key={k} onClick={() => setMetric(k)} className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                metric === k ? 'text-slate-900' : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
              }`} style={metric === k ? { background: METRICS[k].color } : undefined}>
                {METRICS[k].label}
              </button>
            ))}
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 10, bottom: 0, left: -15 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="t" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} minTickGap={40} />
              <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
              <Tooltip content={<GlassTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={m.ref} stroke={m.color} strokeDasharray="4 4" strokeOpacity={0.5}
                label={{ value: 'Ideal', fontSize: 10, fill: m.color, position: 'insideTopRight' }} />
              <Line type="monotone" dataKey={metric} stroke={m.color} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="glass rounded-2xl p-6 lg:col-span-2">
          <h3 className="mb-4 flex items-center gap-2 font-display text-sm font-semibold text-slate-200">
            <Calendar size={15} className="text-aqua-300" /> Daily Average Profile
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 5, right: 10, bottom: 0, left: -15 }}>
                <defs>
                  <linearGradient id="gpH" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gTemp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fb923c" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#fb923c" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="t" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} minTickGap={40} />
                <YAxis yAxisId="left" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip content={<GlassTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area yAxisId="left" type="monotone" dataKey="pH" stroke="#f43f5e" strokeWidth={2} fill="url(#gpH)" name="pH" />
                <Area yAxisId="right" type="monotone" dataKey="temp" stroke="#fb923c" strokeWidth={2} fill="url(#gTemp)" name="Temp °C" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass rounded-2xl p-6">
          <h3 className="mb-4 flex items-center gap-2 font-display text-sm font-semibold text-slate-200">
            <TrendingUp size={15} className="text-aqua-300" /> This Week vs Last
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekCompare} margin={{ top: 5, right: 5, bottom: 0, left: -15 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="day" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip content={<GlassTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="this" fill="#22d3ee" radius={[4, 4, 0, 0]} name="This week" />
                <Bar dataKey="last" fill="rgba(148,163,184,0.3)" radius={[4, 4, 0, 0]} name="Last week" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}

const weekCompare = [
  { day: 'Mon', this: 7.1, last: 7.2 },
  { day: 'Tue', this: 6.9, last: 7.0 },
  { day: 'Wed', this: 6.7, last: 7.1 },
  { day: 'Thu', this: 6.6, last: 6.9 },
  { day: 'Fri', this: 6.5, last: 7.0 },
  { day: 'Sat', this: 6.6, last: 6.8 },
  { day: 'Sun', this: 6.5, last: 7.0 },
]
