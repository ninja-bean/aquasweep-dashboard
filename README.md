# AquaSweep

[![Status: prototype](https://img.shields.io/badge/status-prototype-FF6B6B)]()

An open aquaculture robot boat for a single pond, driven by an **ESP32** and
controlled and monitored from a **React dashboard** over **MQTT**. The device
publishes sensor telemetry; the browser subscribes through a local Mosquitto
broker (WebSocket) and sends movement/actuator commands back.

> **Prototype.** Motors, belt, servo, ultrasonic and turbidity are wired per
> the original firmware; pH, temperature and battery are software **stubs**
> that report `ok:false` until hardware is added. See
> [feature-gap.md](docs/feature-gap.md).

## Architecture

```
 ESP32 (PlatformIO / Arduino)                    Browser (React + Vite + mqtt.js)
   publish telemetry (2 s)  ─────────►  Mosquitto  ◄───────────  publish cmd
   subscribe cmd            ◄─────────  1883/9001  ──►  subscribe telemetry/ack/status
   publish ack / status (retained + LWT)
```

| Topic (`aquasweep/pond-a01/…`) | Direction | Payload |
|---|---|---|
| `telemetry` | device → broker | `{d, ts, fw, ut, rssi, spd, sensors{bin,turb,obst,ph,temp,batt{mvolts,pct,ok}}}` |
| `cmd` | broker → device | `{c: move\|speed\|belt\|feed\|pickup\|empty\|home\|calib, v}` |
| `ack` | device → broker | `{c, v, ok, msg, seq, ts, spd}` |
| `status` | device → broker | `"online"` / `"offline"` (retained + LWT) |

Full protocol: [docs/mqtt-protocol.md](docs/mqtt-protocol.md).

## Repository layout

```
firmware/           PlatformIO ESP32 firmware (MQTT edition)
  include/config.h  Pins, topics, constants (WiFi creds in gitignored secrets.h)
  src/main.cpp      Sensors → telemetry, command handler, acks, presence (LWT)
  legacy/           Original HTTP firmware, archived for reference
src/                React dashboard: Vite, Tailwind v4, mqtt.js, recharts
infra/              Local Mosquitto broker config (TCP 1883 + WebSocket 9001)
docs/               Architecture · hardware · dashboard · MQTT protocol
```

## Hardware at a glance

| Function | Pin |
|---|---|
| Motor H-bridge inputs | `17` `15` `4` `16` |
| Conveyor belt relay (active low) | `27` |
| Feeder servo | `25` |
| Ultrasonic TRIG / ECHO | `22` / `23` |
| Turbidity | `32` |
| pH (PH-4502C, stub) | `34` |
| Temp (DS18B20, stub) | `33` |
| Battery divider (ADC1, stub) | `36` |

Motors are PWM-driven over LEDC at 5 kHz with a live 0–100 % throttle
(`{"c":"speed","v":60}` or per-move `speed`). Details:
[docs/hardware.md](docs/hardware.md).

## Getting started

### 1. Broker (local Mosquitto)

```bash
mosquitto -c infra/mosquitto.conf
```

Serves TCP `1883` for the ESP32 and WebSocket `9001` for the dashboard.
Sanity check: `mosquitto_sub -h localhost -t 'aquasweep/#' -v`.

### 2. Firmware (ESP32)

```bash
cd firmware
cp include/secrets.h.example include/secrets.h   # fill in your Wi-Fi
# edit include/config.h → MQTT_HOST (broker LAN IP)
pio run -t upload
pio device monitor
```

Wi-Fi credentials are never committed — they live in the gitignored
`firmware/include/secrets.h`.

### 3. Dashboard

```bash
npm install
npm run dev      # starts the broker + Vite
# or: npm run dev -- just Vite, if Mosquitto runs separately
```

Open the printed URL (default `http://localhost:5173`), which connects to
`ws://localhost:9001/mqtt` (override with `VITE_MQTT_URL`). Sensors render `—`
until the device connects; the header flips to **Reconnecting** if broker or
device drops.

## Documentation

- [docs/README.md](docs/README.md) — index
- [docs/architecture.md](docs/architecture.md) — system overview & data flow
- [docs/hardware.md](docs/hardware.md) — firmware, pinout, PWM, build/flash
- [docs/stub-hardware-integration.md](docs/stub-hardware-integration.md) — wiring pins + battery voltage system design for the stub sensors
- [docs/dashboard.md](docs/dashboard.md) — React app, MQTT client, views, deploy
- [docs/mqtt-protocol.md](docs/mqtt-protocol.md) — protocol reference & gotchas
- [docs/feature-gap.md](docs/feature-gap.md) — limitations & roadmap

## Status

AquaSweep is under active development as a hobby/research prototype. No
hardware autonomy, GPS, camera, or ESC supervision yet — most panels outside of
motion and the real sensors show placeholder or computed values. Dissolved O₂
is derived from water temperature (freshwater saturation model), not measured.