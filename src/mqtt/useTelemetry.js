// React bridge between the mqtt.js client and the dashboard state.
// Subscribes telemetry (sensor packet), status (device presence via retained
// + LWT) and ack (command confirmations). Exposes imperative sendCmd for the
// DroneView controls.

import { useCallback, useEffect, useState } from 'react'
import { TOPICS } from '../config'
import { onConnectionState, publish, subscribe } from './mqttClient'
import { tempToDO } from '../utils/oxygen'

const MAX_HISTORY = 72
const MAX_OBSTACLE_HISTORY = 16
const MAX_EVENT_LOG = 8

const ACK_EVENT_TYPE = {
  move: 'nav',
  belt: 'feed',
  feed: 'feed',
  pickup: 'feed',
  empty: 'sys',
  home: 'sys',
  calib: 'sensor',
}

function rowTime(ts) {
  const d = ts ? new Date(ts * 1000) : new Date()
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// Convert the firmware packet to the dashboard telemetry shape.
function mapTelemetry(pkt) {
  const s = pkt?.sensors || {}
  const ph = s.ph?.val ?? null
  const temp = s.temp?.c ?? null
  const turb = s.turb?.pct ?? null
  const bin = s.bin?.pct ?? null
  const obstacle = s.obst?.cm ?? null
  const battMV = s.batt?.mvolts ?? null
  const battPct = s.batt?.pct ?? null

  return {
    pH: ph != null ? Math.round(ph * 100) / 100 : null,
    temp: temp != null ? Math.round(temp * 10) / 10 : null,
    turbidity: turb,
    oxygen: tempToDO(temp),
    bin,
    // Prefer the firmware-computed percent; fall back to a mV-based estimate
    // (11.1 V nominal 3S) for older firmware that omits batt.pct.
    battery: battPct != null
      ? Math.round(battPct)
      : battMV != null
        ? Math.round(Math.min(100, Math.max(0, battMV / 11100) * 100))
        : null,
    batteryMV: battMV,
    trash: {
      detected: obstacle != null ? obstacle < 40 : null,
      obstacle,
      history: [],
    },
    fw: pkt?.fw ?? null,
    rssi: pkt?.rssi ?? null,
    spd: pkt?.spd ?? null,
    ts: pkt?.ts ?? null,
  }
}

export function useTelemetry() {
  const [brokerOnline, setBrokerOnline] = useState(false)
  const [deviceOnline, setDeviceOnline] = useState(false)
  const [telemetry, setTelemetry] = useState(() =>
    mapTelemetry({ sensors: { ph: { ok: false }, temp: { ok: false } } })
  )
  const [history, setHistory] = useState([])
  const [sparklines, setSparklines] = useState({ pH: [], temp: [], turbidity: [], oxygen: [], obstacle: [] })
  const [eventLog, setEventLog] = useState([])
  const [lastCommand, setLastCommand] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)

  useEffect(() => {
    const off = onConnectionState((state) => {
      setBrokerOnline(state === 'connected')
      if (state !== 'connected') setDeviceOnline(false)
    })

    // Fleet state never changes during a session; each topic may only be
    // subscribed once, so register every connected state-bump no-ops.
    subscribe(TOPICS.telemetry, (payload) => {
      try {
        const pkt = JSON.parse(payload)
        const mapped = mapTelemetry(pkt)
        setSparklines((prev) => ({
          pH: [...prev.pH, mapped.pH].filter((v) => v != null).slice(-MAX_HISTORY),
          temp: [...prev.temp, mapped.temp].filter((v) => v != null).slice(-MAX_HISTORY),
          turbidity: [...prev.turbidity, mapped.turbidity].filter((v) => v != null).slice(-MAX_HISTORY),
          oxygen: [...prev.oxygen, mapped.oxygen].filter((v) => v != null).slice(-MAX_HISTORY),
          obstacle: [...prev.obstacle, mapped.trash.obstacle].filter((v) => v != null).slice(-MAX_OBSTACLE_HISTORY),
        }))
        setHistory((h) =>
          [...h, { t: rowTime(mapped.ts), pH: mapped.pH, temp: mapped.temp, turbidity: mapped.turbidity, oxygen: mapped.oxygen }]
            .slice(-MAX_HISTORY)
        )
        setTelemetry((prev) => ({
          ...mapped,
          trash: {
            ...mapped.trash,
            history: [...(prev?.trash?.history ?? []), mapped.trash.obstacle].filter((v) => v != null).slice(-MAX_OBSTACLE_HISTORY),
          },
        }))
        setLastUpdate(new Date())
      } catch (e) {
        console.error('Bad telemetry packet', e)
      }
    })

    subscribe(TOPICS.status, (payload) => {
      const state = payload.trim()
      setDeviceOnline(state === 'online')
      if (state === 'online') setLastUpdate(new Date())
    })

    subscribe(TOPICS.ack, (payload) => {
      try {
        const ack = JSON.parse(payload)
        const label = ack.msg || ack.c
        const type = ACK_EVENT_TYPE[ack.c] ?? 'sys'
        setEventLog((l) => [{ time: rowTime(ack.ts), type, msg: label }, ...l].slice(0, MAX_EVENT_LOG))
        setLastCommand(label)
      } catch (e) {
        console.error('Bad ack packet', e)
      }
    })

    return off
  }, [])

  const sendCmd = useCallback((payload, { label, type = 'sys' } = {}) => {
    publish(TOPICS.cmd, payload, { qos: 1 })
    setLastCommand(label ?? payload.c)
    setEventLog((l) => [{ time: rowTime(), type, msg: label ?? `${payload.c} sent` }, ...l].slice(0, MAX_EVENT_LOG))
  }, [])

  return {
    brokerOnline,
    deviceOnline,
    telemetry,
    history,
    sparklines,
    eventLog,
    lastCommand,
    lastUpdate,
    sendCmd,
  }
}