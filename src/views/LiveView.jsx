import { Droplet, Thermometer, Wind, Trash2, Waves, BatteryCharging, AlertTriangle, Radar } from 'lucide-react'
import Gauge from '../components/Gauge'
import SensorCard from '../components/SensorCard'
import { TELEMETRY_INTERVAL_MS } from '../config'

export default function LiveView({ telemetry, sparklines, alerts, meta }) {
  const { pH, temp, turbidity, oxygen, bin, battery, trash } = telemetry

  const binColor = bin != null && bin > 85 ? '#f59e0b' : '#22d3ee'
  const battColor = battery != null
    ? battery < 20 ? '#f43f5e'
    : battery < 45 ? '#f59e0b'
    : '#34d399'
    : '#334155'

  return (
    <div className="animate-fade-up space-y-6">
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-slate-200">Live Telemetry</h2>
          <span className="flex items-center gap-2 rounded-full border border-aqua-400/30 bg-aqua-400/10 px-3 py-1 text-xs font-medium text-aqua-300">
            <span className="h-2 w-2 animate-ping rounded-full bg-aqua-400" />
            <span className="ml-2 -translate-x-4">MQTT · {TELEMETRY_INTERVAL_MS / 1000}s feed</span>
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          <div className="glass flex flex-col items-center justify-center rounded-2xl p-4">
            <Gauge value={pH} min={0} max={14} unit="" label="pH Level" color="#f43f5e" warnLow={6.8} warnHigh={8.2} />
          </div>
          <div className="glass flex flex-col items-center justify-center rounded-2xl p-4">
            <Gauge value={temp} min={0} max={50} unit="°C" label="Water Temp" color="#fb923c" warnHigh={32} warnLow={18} />
          </div>
          <div className="glass flex flex-col items-center justify-center rounded-2xl p-4">
            <Gauge value={turbidity} min={0} max={100} unit="%" label="Turbidity" color="#eab308" warnHigh={30} />
          </div>
          <div className="glass flex flex-col items-center justify-center rounded-2xl p-4">
            <Gauge value={bin} min={0} max={100} unit="%" label="Bin Fullness" color={binColor} warnHigh={85} />
          </div>
          <div className="glass flex flex-col items-center justify-center rounded-2xl p-4">
            <Gauge value={battery} min={0} max={100} unit="%" label="Battery" color={battColor} warnLow={45} warnHigh={20} />
          </div>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-slate-200">Sensor Feed</h2>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-slate-800/80 px-2.5 py-1 font-mono text-[10px] text-slate-400">ESP32 · FW {meta.fw || '—'}</span>
            <span className={`rounded-md px-2.5 py-1 font-mono text-[10px] ${meta.rssi != null ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800/80 text-slate-500'}`}>
              RSSI {meta.rssi != null ? `${meta.rssi} dBm` : '—'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SensorCard
            icon={<Droplet size={20} />} label="Water pH" value={pH != null ? pH.toFixed(2) : null} unit="pH"
            sub="PH-4502C module · optimal 6.8 – 8.2" history={sparklines.pH} color="#f43f5e"
            status={pH != null && (pH < 6.8 || pH > 8.2) ? 'bad' : 'good'}
            lastSync={`${TELEMETRY_INTERVAL_MS / 1000} s`}
          />
          <SensorCard
            icon={<Thermometer size={20} />} label="Temperature" value={temp != null ? temp.toFixed(1) : null} unit="°C"
            sub="DS18B20 probe · depth 0.5 m" history={sparklines.temp} color="#fb923c"
            status={temp != null && (temp > 32 || temp < 18) ? 'bad' : 'good'}
            lastSync={`${TELEMETRY_INTERVAL_MS / 1000} s`}
          />
          <SensorCard
            icon={<Waves size={20} />} label="Turbidity" value={turbidity != null ? turbidity.toFixed(0) : null} unit="%"
            sub="Scattered light · 880 nm · 0-100" history={sparklines.turbidity} color="#eab308"
            status={turbidity != null && turbidity > 30 ? 'warn' : 'good'}
            lastSync={`${TELEMETRY_INTERVAL_MS / 1000} s`}
          />
          <SensorCard
            icon={<Wind size={20} />} label="Dissolved O₂" value={oxygen != null ? oxygen.toFixed(1) : null} unit="mg/L"
            sub="Calculated from temp · saturation model" history={sparklines.oxygen} color="#34d399"
            status={oxygen != null && oxygen < 5 ? 'warn' : 'good'}
            lastSync={`${TELEMETRY_INTERVAL_MS / 1000} s`}
          />
          <SensorCard
            icon={<Radar size={20} />} label="Obstacle Proximity" value={trash.obstacle != null ? trash.obstacle : null} unit="cm"
            sub="HC-SR04 ultrasonic" history={trash.history} color="#a78bfa"
            status={trash.obstacle != null && trash.obstacle < 40 ? 'warn' : 'good'}
            lastSync={`${TELEMETRY_INTERVAL_MS / 1000} s`}
          />
          <SensorCard
            icon={<Trash2 size={20} />} label="Trash Detection" value={trash.detected == null ? null : trash.detected ? 'TRUE' : 'FALSE'} unit=""
            sub={trash.detected ? 'Debris in sweep zone' : trash.detected == null ? 'Awaiting first sweep' : 'Sweep zone clear'}
            history={trash.history} color="#f472b6"
            status={trash.detected ? 'warn' : 'good'}
            lastSync={`${TELEMETRY_INTERVAL_MS / 1000} s`}
          />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="glass rounded-2xl p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-slate-200">Active Alerts</h3>
            <span className="rounded-full bg-rose-500/15 px-2.5 py-0.5 text-xs font-semibold text-rose-400">
              {alerts.filter((a) => a.level === 'critical').length} critical
            </span>
          </div>
          <div className="space-y-3">
            {alerts.map((a, i) => (
              <div key={i} className={`flex items-start gap-3 rounded-xl border p-3 ${
                a.level === 'critical' ? 'border-rose-500/30 bg-rose-500/10'
                : a.level === 'warning' ? 'border-amber-500/30 bg-amber-500/10'
                : 'border-slate-600/30 bg-slate-700/10'
              }`}>
                <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                  a.level === 'critical' ? 'bg-rose-500/20 text-rose-400' : a.level === 'warning' ? 'bg-amber-500/20 text-amber-400' : 'bg-aqua-500/20 text-aqua-300'
                }`}>
                  <AlertTriangle size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-200">{a.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-400">{a.detail}</p>
                </div>
                <span className="shrink-0 text-[10px] text-slate-500">{a.time}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-2">
            <BatteryCharging size={16} className="text-aqua-300" />
            <h3 className="font-display text-sm font-semibold text-slate-200">Power System</h3>
          </div>
          <div className="mt-4 flex items-end justify-between">
            <div>
              <p className="font-display text-3xl font-bold text-slate-100">{battery != null ? `${battery}%` : '—'}</p>
              <p className="text-xs text-slate-500">Li-ion 3S · 11.1 V nominal</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-sm text-aqua-300">
                {telemetry.batteryMV != null ? `${(telemetry.batteryMV / 1000).toFixed(2)} V` : '— V'}
              </p>
              <p className="text-[10px] text-slate-500">Battery % computed on device</p>
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${battery ?? 0}%`, background: `linear-gradient(90deg, ${battColor}88, ${battColor})` }}
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg bg-slate-800/60 py-2">
              <p className="font-mono text-sm font-semibold text-emerald-400">ESC 1 · OK</p>
            </div>
            <div className="rounded-lg bg-slate-800/60 py-2">
              <p className="font-mono text-sm font-semibold text-emerald-400">ESC 2 · OK</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}