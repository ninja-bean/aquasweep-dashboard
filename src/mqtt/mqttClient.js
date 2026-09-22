// Thin singleton wrapper around mqtt.js (WebSocket transport to the local
// Mosquitto broker). Keeps a single shared client; callers subscribe once
// and react via registered state/message listeners. StrictMode-safe: no
// duplicate subscriptions or duplicate event listeners.

import mqtt from 'mqtt'
import { MQTT_URL } from '../config'

let client = null
let readySubscriptions = null
let eventsBound = false

// ---- connection-state broadcast to hook listeners ----
const stateListeners = new Set()
function broadcastState(state) {
  stateListeners.forEach((fn) => fn(state))
}

function ensureClient() {
  if (client) return client
  client = mqtt.connect(MQTT_URL, {
    reconnectPeriod: 3000,
    connectTimeout: 8000,
    keepalive: 30,
    clean: true,
  })
  if (!eventsBound) {
    eventsBound = true
    client.on('connect', () => {
      if (readySubscriptions) {
        readySubscriptions.forEach((fn) => fn())
        readySubscriptions = null
      }
      broadcastState('connected')
    })
    client.on('reconnect', () => broadcastState('reconnecting'))
    client.on('close', () => broadcastState('disconnected'))
    client.on('offline', () => broadcastState('offline'))
  }
  return client
}

// Queue subscriptions until the socket is actually up.
function whenConnected(fn) {
  const c = ensureClient()
  if (c.connected) {
    fn()
    return
  }
  readySubscriptions = readySubscriptions || []
  readySubscriptions.push(fn)
}

export function getClient() {
  return ensureClient()
}

export function onConnectionState(listener) {
  ensureClient()
  stateListeners.add(listener)
  return () => stateListeners.delete(listener)
}

// One message listener dispatches to per-topic handlers; registering the same
// topic again (React StrictMode double-mount) replaces the handler instead of
// stacking duplicate listeners.
const topicHandlers = new Map()
let boundMessage = false

export function subscribe(topic, handler) {
  const c = ensureClient()
  topicHandlers.set(topic, handler)
  if (!boundMessage) {
    boundMessage = true
    c.on('message', (t, payload) => {
      const h = topicHandlers.get(t)
      if (h) h(payload.toString(), t)
    })
  }
  whenConnected(() => {
    if (!c._asSubscribed) c._asSubscribed = new Set()
    if (!c._asSubscribed.has(topic)) {
      c._asSubscribed.add(topic)
      c.subscribe(topic, { qos: 1 })
    }
  })
}

export function publish(topic, message, { qos = 1, retain = false } = {}) {
  const c = ensureClient()
  const payload = typeof message === 'string' ? message : JSON.stringify(message)
  if (c.connected) c.publish(topic, payload, { qos, retain })
}

export function destroyClient() {
  if (client) {
    client.end(true)
    client = null
    eventsBound = false
    topicHandlers.clear()
    stateListeners.clear()
  }
}