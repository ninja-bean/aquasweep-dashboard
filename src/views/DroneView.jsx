import { useRef, useState } from 'react'
import { Compass, Fish, Trash2, Delete, CircleDot, Pause, MapPin, Navigation } from 'lucide-react'

const feedColors = { nav: '#22d3ee', sensor: '#eab308', feed: '#34d399', sys: '#a78bfa' }

export default function DroneView({ sendCmd, eventLog, lastCommand, deviceOnline, telemetry }) {
  const lastDirRef = useRef(null)
  const [speed, setSpeed] = useState(45)
  const speedTimer = useRef(null)
  // Device-authoritative throttle once telemetry arrives; the slider edits it.
  const throttle = telemetry.spd ?? speed

  const applySpeed = (v) => {
    setSpeed(v)
    if (speedTimer.current) clearTimeout(speedTimer.current)
    speedTimer.current = setTimeout(() => {
      sendCmd({ c: 'speed', v }, { label: `Speed set to ${v}%`, type: 'nav' })
    }, 250)
  }

  // Momentary movement: move while a control is held, stop on release.
  // Direction changes are de-duped so a held control only sends on change.
  const startMove = (dir) => {
    if (lastDirRef.current === dir) return
    lastDirRef.current = dir
    sendCmd(
      { c: 'move', v: dir, speed: throttle },
      { label: dir === 'stop' ? 'Motors stopped' : `Move ${dir} · thrust ${throttle}%`, type: 'nav' }
    )
  }

  const stopMove = (label = 'Motors stopped') => {
    lastDirRef.current = null
    sendCmd({ c: 'move', v: 'stop', speed: throttle }, { label, type: 'nav' })
  }

  const fire = (payload, label, type) => sendCmd(payload, { label, type })

  const controlsDisabled = !deviceOnline

  return (
    <div className="animate-fade-up space-y-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-slate-200">Drone Control</h2>
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
            deviceOnline
              ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-400'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-400'
          }`}>
            <span className={`h-2 w-2 animate-pulse rounded-full ${deviceOnline ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            {deviceOnline ? 'Manual Mode' : 'Device Offline'}
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-slate-500/30 bg-slate-700/20 px-3 py-1 text-xs font-medium text-slate-400">
            <Compass size={12} /> 214° · {telemetry.rssi != null ? `${telemetry.rssi} dBm` : '— RSSI'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="glass flex flex-col items-center rounded-2xl p-6 lg:col-span-2">
          <div className="mb-5 flex w-full items-center justify-between">
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-200">Motion Controller</h3>
              <p className="text-[10px] text-slate-500">Momentary — hold to move, release to stop</p>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-400">
              Speed
              <input type="range" min={5} max={95} step={5} value={throttle} onChange={(e) => applySpeed(Number(e.target.value))} className="w-24 accent-cyan-400" />
              <span className="font-mono text-sm text-aqua-300">{throttle}%</span>
            </label>
          </div>

          <div className={`flex flex-col items-center gap-5 ${controlsDisabled ? 'pointer-events-none opacity-50 select-none' : ''}`}>
            <div className="flex flex-col items-center gap-2">
              <DpadButton dir="N" onPress={() => startMove('forward')} onRelease={() => stopMove()} />
              <div className="flex gap-2">
                <DpadButton dir="W" onPress={() => startMove('left')} onRelease={() => stopMove()} />
                <DpadButton dir="S" onPress={() => startMove('reverse')} onRelease={() => stopMove()} />
                <DpadButton dir="E" onPress={() => startMove('right')} onRelease={() => stopMove()} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1.5 rounded-xl border border-aqua-400/30 bg-aqua-500/10 px-4 py-2 text-xs font-semibold text-aqua-300 transition hover:bg-aqua-500/20"
                onClick={() => fire({ c: 'home' }, 'Auto-return to dock (stub)', 'sys')}>
                <Navigation size={13} /> Return Home
              </button>
              <button className="flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-400 transition hover:bg-rose-500/20 active:scale-95"
                onClick={() => stopMove('Emergency stop')}>
                <Pause size={13} /> STOP
              </button>
            </div>
          </div>

          <div className="mt-6 grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { icon: <Fish size={16} />, label: 'Dispense Fish Food', desc: 'Servo hopper · 200 g', color: '#34d399', payload: { c: 'feed' }, type: 'feed' },
              { icon: <Trash2 size={16} />, label: 'Pickup Trash', desc: 'Conveyor sweep', color: '#22d3ee', payload: { c: 'pickup' }, type: 'feed' },
              { icon: <Delete size={16} />, label: 'Empty Bin', desc: 'Dump at collection dock', color: '#f59e0b', payload: { c: 'empty' }, type: 'sys' },
            ].map((a) => (
              <button key={a.payload.c} onClick={() => fire(a.payload, `${a.label} triggered`, a.type)}
                className={`group relative overflow-hidden rounded-xl border border-white/10 bg-slate-800/60 p-4 text-left transition hover:-translate-y-0.5 hover:border-white/20 active:scale-[0.98] ${controlsDisabled ? 'pointer-events-none opacity-50' : ''}`}>
                <span className="relative flex items-center gap-2 font-semibold" style={{ color: a.color }}>{a.icon} {a.label}</span>
                <span className="relative mt-1 block text-[11px] text-slate-500">{a.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="glass rounded-2xl p-5">
            <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-slate-200">
              <MapPin size={15} className="text-aqua-300" /> Mission Status
            </h3>
            <div className="space-y-2.5 text-xs">
              {[
                ['Telemetry link', deviceOnline ? 'OK · MQTT' : 'DOWN', deviceOnline ? 'text-emerald-400' : 'text-rose-400'],
                ['Firmware', telemetry.fw || '—', 'text-slate-300'],
                ['Thrust', telemetry.spd != null ? `${telemetry.spd}%` : '—', 'text-aqua-300'],
                ['Propulsion', 'Motors idle · ESCs nominal', 'text-slate-300'],
                ['Camera feed', '1280×720 · 12 fps', 'text-slate-300'],
                ['GPS fix', '3D · 6 satellites', 'text-slate-300'],
                ['Last command', lastCommand || '—', 'text-aqua-300'],
              ].map(([k, v, c]) => (
                <div key={k} className="flex items-center justify-between border-b border-white/5 pb-2 last:border-0">
                  <span className="text-slate-500">{k}</span>
                  <span className={`font-mono ${c}`}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="glass rounded-2xl p-5">
            <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-slate-200">
              <CircleDot size={15} className="text-aqua-300" /> Event Log
            </h3>
            <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
              {eventLog.length === 0 ? (
                <p className="rounded-lg bg-slate-800/50 px-3 py-2 text-[11px] text-slate-500">No events yet — waiting for device acks.</p>
              ) : (
                eventLog.map((e, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg bg-slate-800/50 px-3 py-2">
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: feedColors[e.type] }} />
                    <p className="flex-1 text-[11px] leading-snug text-slate-300">{e.msg}</p>
                    <span className="shrink-0 font-mono text-[9px] text-slate-600">{e.time}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="glass rounded-2xl p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-slate-200">
                <Pause size={14} className="text-aqua-300" /> Safety
              </h3>
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">ENABLED</span>
            </div>
            <ul className="space-y-1.5 text-[11px] text-slate-400">
              <li>· Auto-hover if link lost &gt; 2 s</li>
              <li>· Obstacle brake &lt; 35 cm</li>
              <li>· No-fly within 2 m of pH probe</li>
              <li>· Emergency kill on battery &lt; 15%</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

function DpadButton({ dir, onPress, onRelease }) {
  const deg = { N: 0, E: 90, S: 180, W: 270 }[dir]
  return (
    <button
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onPress() }}
      onPointerUp={onRelease}
      onPointerCancel={onRelease}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); onPress() } }}
      onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') onRelease() }}
      onBlur={onRelease}
      className="flex h-12 w-12 touch-none select-none items-center justify-center rounded-xl border border-white/10 bg-slate-800/60 text-slate-300 shadow-lg transition hover:border-aqua-400/40 hover:bg-aqua-500/10 hover:text-aqua-300 active:scale-90"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" transform={`rotate(${deg})`}>
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    </button>
  )
}