export const DEVICE_ID = 'pond-a01'

export const MQTT_URL = import.meta.env.VITE_MQTT_URL || 'ws://localhost:9001/mqtt'

export const TOPICS = {
  telemetry: `aquasweep/${DEVICE_ID}/telemetry`,
  cmd: `aquasweep/${DEVICE_ID}/cmd`,
  ack: `aquasweep/${DEVICE_ID}/ack`,
  status: `aquasweep/${DEVICE_ID}/status`,
}

export const TELEMETRY_INTERVAL_MS = 2000