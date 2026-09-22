# Architecture

## System overview

AquaSweep is a two-sided system with a local broker in the middle. No cloud,
no backend server — the browser talks MQTT directly.

```
 ESP32 (firmware/)                              Browser dashboard (src/)
 ── WiFi STA (LAN)                          ╱   React + Vite + mqtt.js
 ── publish telemetry (QoS 1, 2 s)  ──►  Mosquitto  ◄── publish cmd
 ── subscribe cmd                 ◄────  (local)  ────►  (WebSocket)
 ── publish ack / status (retained + LWT)     subscribe telemetry/ack/status
```

## Components

### 1. Firmware — `firmware/`
PlatformIO ESP32 project (Arduino framework, `espressif32/esp32dev`).

- Reads sensors into a per-cycle snapshot, publishes a JSON packet on
  `telemetry` every `TELEMETRY_MS` (2 s).
- Subscribes to `cmd`, dispatches to motor/belt/servo drivers, and answers on
  `ack` with `{c, v, ok, msg, seq, ts, spd}`.
- Publishes `"online"` with retain on the `status` topic at connect, and sets
  an MQTT **Last Will** so the broker flips that same topic to `"offline"`
  (retained) when the device drops.
- WiFi credentials are **not committed** — see
  [hardware.md](hardware.md#network-and-broker-configuration).

### 2. Broker — `infra/mosquitto.conf`
Native Mosquitto with two listeners:

| Listener | Protocol | Used by |
|---|---|---|
| `1883` | TCP (all interfaces / LAN) | ESP32 firmware |
| `9001` | WebSockets | Browser dashboard |

- `allow_anonymous true`, persistence on (retained `online`/`offline` survive
  restarts).
- Machine-specific absolute paths for persistence/log are documented in the
  file; adjust to taste.

### 3. Dashboard — `src/`
React + Vite SPA. `mqtt.js` connects to `ws://<host>:9001/mqtt`. A single
client singleton dispatches to per-topic handlers; the `useTelemetry()` hook
owns all dashboard MQTT state and exposes `sendCmd()`.

## Runtime lifecycle (device)

1. Boot → `setup()`: attach PWM channels, drive everything to a safe state
   (motors `stopMotor()`, belt relay OFF), start sensors, load pH calibration
   from NVS.
2. `connectWiFi()` — STA connect, best-effort NTP (for telemetry timestamps).
3. `connectMQTT()` — connect with LWT, subscribe `cmd`, publish retained
   `"online"`; if a publish/sensor cycle is ever interrupted the broker
   republishes retained `"offline"` on the last will.
4. Loop: keep `mqtt.loop()` draining; every 2 s run `publishTelemetry()`.
   Reconnect every 5 s while disconnected.

## Network topology and ports

```
[ESP32] ──Wi-Fi──► ┌──────────┐ ──TCP 1883──► ┌─────────────┐
                   │ LAN / AP │               │ Mosquitto   │
[browser] ────────► └──────────┘ ──WS 9001──► │ (this host) │
```

- The firmware must point `MQTT_HOST` at the broker's LAN IP (edit
  `firmware/include/config.h`).
- The dashboard defaults to `ws://localhost:9001/mqtt`; override with
  `VITE_MQTT_URL` (see `.env.example`).
- On Windows, inbound allowances for TCP 1883 and TCP 9001 may be needed in
  the firewall for the ESP32 to reach the broker.

## Security notes

- The broker is **local and anonymous** (`allow_anonymous true`) — do not
  expose it to the internet.
- No secrets in the repo: firmware Wi-Fi credentials live in a gitignored
  `firmware/include/secrets.h` (template: `secrets.h.example`).
- The dashboard is built with `base: './'` so a static build can be hosted
  behind any path.