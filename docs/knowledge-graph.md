# AquaSweep Dashboard — Internal Knowledge Graph

Single-page React dashboard (Vite) for controlling and monitoring an autonomous
aquaculture drone boat ("AquaSweep") on Pond A-01, wired to a real ESP32 via a
**local Mosquitto broker (MQTT)**. No demo/simulated data anymore: gauges show
live sensor state, sensors not yet connected render `—` / "No data".

## System overview

```
ESP32 firmware (firmware/)                     Browser dashboard (React)
  publish  telemetry (2 s) ──────────► Mosquitto (1883/9001) ──► mqtt.js (WS)
  subscribe cmd  ◄──────────────────────────  publish  controls  ◄──
  publish ack / status (retained + LWT)
```

- Broker: `infra/mosquitto.conf` — `listener 1883` (ESP32), `listener 9001
  protocol websockets` (browser). Native install, `mosquitto -c` to run.
- Dissolved O₂ is **computed from temperature** on the dashboard
  (`src/utils/oxygen.js`, freshwater saturation polynomial). No O₂ sensor.

## Layout / File Map

```
firmware/                 PlatformIO ESP32 project (Arduino framework)
  platformio.ini          espressif32/esp32dev; PubSubClient, ArduinoJson, OneWire, DallasTemperature
  include/config.h        WiFi/MQTT settings, topic strings, pinout, pH calibration, NVS keys
  src/main.cpp            Sensors → telemetry publish, command handler, acks, presence (LWT)
infra/mosquitto.conf      Local broker (TCP 1883 + WebSocket 9001, anonymous, persisted)
src/
  main.jsx                Entry point → renders <App/> in StrictMode
  App.jsx                 Shell: nav, header (Online/Reconnecting, battery), view switch
  App.css                 DEAD — leftover Vite template styles, unused
  index.css               Tailwind v4 theme, glass/glow utilities, keyframes
  config.js               MQTT_URL, DEVICE_ID, topic literals, telemetry cadence
  data.js                  Static: SPECIES, DAILY_ALERTS (no sim history/log)
  mqtt/
    mqttClient.js          mqtt.js singleton: lazy connect, reconnect, per-topic handlers, publish
    useTelemetry.js        React hook → telemetry/history/sparklines/eventLog/sendCmd + mapping
  utils/oxygen.js          tempToDO(°C) — dissolved-O₂ saturation model
  views/
    LiveView.jsx           Gauges + sensor cards + alerts + power panel (null-safe)
    DroneView.jsx          Joystick/D-pad/action buttons → sendCmd; ack-driven event log
    AnalyticsView.jsx      recharts trend/area/bar charts; summary cards (null-safe)
    FungAiView.jsx         Species advisor; radar/bar charts, risk model (null-tolerant)
  components/
    Gauge.jsx              Radial gauge — renders '—' when value is null
    SensorCard.jsx         Metric card + Sparkline; "No data" state when value null
    FishArtwork.jsx        FishArt — low-poly SVG line-art per species
```

## MQTT protocol (source of truth)

| Topic | QoS | Direction | Payload |
|---|---|---|---|
| `aquasweep/pond-a01/telemetry` | 1 | device→broker | JSON packet (below) |
| `aquasweep/pond-a01/cmd` | 1 | broker→device | `{c, v}` |
| `aquasweep/pond-a01/ack` | 1 | device→broker | `{c, v, ok, msg, seq, ts}` |
| `aquasweep/pond-a01/status` | 1 | retained + LWT | `"online"` / `"offline"` |

Telemetry packet:
```
{ d:"pond-a01", ts, fw, ut, rssi, spd,
  sensors:{
    bin:{pct}, turb:{pct}, obst:{cm},          // ultrasonic + turbidity ADC
    ph:{adc, mv, val, ok},                     // PH-4502C stub, ok:false if absent
    temp:{c, ok},                              // DS18B20 stub
    batt:{mvolts, pct, ok} } }                 // 3S divider; pct computed on device
```

Command `c` values: `move` (v=forward/reverse|backward/left/right/stop, optional
`speed` 0-100), `speed` (v=0-100 → throttle), `belt` (v=0|1), `feed` (one-shot),
`pickup` (belt sweep), `empty` (stub ack), `home` (stub ack + stop),
`calib` (pH 4/7 into NVS).

Acks/telemetry carry `spd` — the device's current throttle in %, so the
dashboard Mission Status can verify the speed-control round-trip.

### Dashboard ←→ hook mapping (`useTelemetry.js`)

`mapTelemetry()` converts the packet to the legacy view contract:
- `sensors.ph.val → telemetry.pH`, `temp.c → temp`, `turb.pct → turbidity`,
  `bin.pct → bin`, `batt.pct → battery` (firmware-computed %; falls back to
  a mV→% estimate at 11.1 V nominal if `pct` is absent), `packet.spd →
  telemetry.spd` (device throttle);
  `obst.cm → trash.obstacle`, `obst.cm < 40 → trash.detected`;
- `oxygen = tempToDO(temp)` (computed);
- extra fields: `fw`, `rssi`, `spd`, `ts`.

Hook state: `telemetry`, `history` (rows `{t, pH, temp, turbidity, oxygen}`),
`sparklines` (per-metric non-null arrays), `eventLog` (acks + optimistic
sends), `lastCommand`, `lastUpdate`, `brokerOnline`, `deviceOnline`,
imperative `sendCmd(payload, {label, type})`.

`App` derives `online = brokerOnline && deviceOnline` → header badge + sidebar
dot. `deviceOnline` comes from the retained `status` topic (LWT flips it to
"offline" on dead drop).

## Plumbing notes / gotchas

- **One mqtt.js client, one message listener.** `mqttClient.js` registers a
  single `'message'` handler that dispatches to per-topic handlers registered
  by `subscribe()` — safe under React StrictMode double-mounts.
- **Nulls everywhere.** Before a sensor is wired its `ok:false` → view values
  may be `null`. `Gauge`, `SensorCard`, Analytics summary cards, and FungAi
  guard for it (`—`, "No data", "missing"). Do not reintroduce `.toFixed()`
  on unguarded values.
- Firmware keeps original pinout + control functions (motors `17,15,4,16`,
  belt relay `27` active-low, servo `25` bit-bang, US `22/23`, turbidity `32`);
  only transport changed (MQTT replaces the old WebServer).
- pH one-point calibration persists in ESP32 NVS via `calib` command.
- Turbidity sensor outputs 0–100% — mapped directly onto the 0–100 gauge
  (units shown as `%`, not NTU).
- `Telemetry cadence`: config `TELEMETRY_MS` (firmware) matches
  `TELEMETRY_INTERVAL_MS` (dashboard label).
- Lint: `npm run lint` (oxlint). Build: `npm run build`. Firmware: `pio run`.

## Task Checklist (when changing something)

1. Update the pointer: `config.js` (broker/device) vs `firmware/include/config.h`
   (broker IP). Both live in the same repo.
2. Change a telemetry field → update `firmware/src/main.cpp` `publishTelemetry()`
   **and** `useTelemetry.js` `mapTelemetry()` together.
3. Add a command → handle it in firmware `onCommand()` + ack, and add a button
   in `DroneView` that calls `sendCmd`.
4. Any new sensor must stay null-safe through `Gauge`/`SensorCard`/FungAi.
5. Run `npm run lint` + `npm run build`; for firmware, `pio run`.