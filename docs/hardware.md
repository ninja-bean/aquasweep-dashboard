# Hardware & Firmware

## Board

- ESP32 DevKit (`esp32dev`), Arduino framework via PlatformIO.
- Libraries: `PubSubClient` 2.8, `ArduinoJson` 6.21.5, `DallasTemperature` 3.9,
  `OneWire` 2.3.8.

## Pinout (identical to the original firmware + new sensor pins)

| Function | Pin | Notes |
|---|---|---|
| Motor IN1 / IN2 / IN3 / IN4 | `17` / `15` / `4` / `16` | H-bridge inputs, LEDC PWM (below) |
| Conveyor belt relay | `27` | **Active low** — `LOW = ON` |
| Feeder servo | `25` | Bit-bang PWM (`servoPulse`) |
| Ultrasonic TRIG / ECHO | `22` / `23` | Bin fullness / obstacle |
| Turbidity (module analog out) | `32` | `analogRead` 0–4095 → 0–100 % |
| pH — PH-4502C analog out | `34` | ADC1 input-only; *stub* (graceful if absent) |
| Temperature — DS18B20 | `33` | OneWire bus; *stub* if probe absent |
| Battery divider | `36` | ADC1 input-only; *stub* unless divider wired |

GPIO `34`, `35`, `36`, `39` are input-only ADC1 channels. The legacy source
(original HTTP firmware this project grew from) is archived at
`firmware/legacy/esp32_http_firmware.txt`.

## Motor speed control (PWM)

The four H-bridge inputs are each attached to a 5 kHz, 8-bit **LEDC** channel.
A move command holds each motor's "high side" at full duty while PWM-driving
the low side: lower duty → more current flows → faster rotation, controlled by
the current throttle `g_speedPct` (0–100).

- `dutyFor(pct)` → `255 * (100 − pct) / 100` (inverse mapping).
- `forwardMotor` / `backwardMotor` / `leftMotor` / `rightMotor` set the four
  pins accordingly; `stopMotor()` writes all zeros.
- `motorPwmAttach` / `motorPwmWrite` are thin wrappers that compile on both
  Arduino-ESP32 core ≥ 3.x (`ledcAttach`/`ledcWrite(pin, duty)`) and 2.0.x
  (`ledcSetup` + `ledcAttachPin` + `ledcWrite(channel, duty)`), so the sketch
  builds on older cores too.

The default throttle is 60% (`MOTOR_DEFAULT_SPEED_PCT`). A `{"c":"speed"}` or
a `speed` field riding on a `move` command updates it on the fly.

## Sensors

- **Ultrasonic** — TRIG/ECHO `pulseIn` (5 ms timeout); distance mapped to bin
  fullness `wastePercent` over 2–14 cm (100 → 0 %).
- **Turbidity** — raw `analogRead` (0–4095) inverted onto 0–100 %.
- **pH (stub)** — PH-4502C analog out, 16-sample averaged, converted to mV;
  `ok=true` only within a plausible 0.3–3.1 V band. `phVal = 7 + (neutral − mv)
  / slope`, slope defaults to the Nernst value (59.16 mV/pH @ 25 °C).
  One-point calibration persists to NVS via the MQTT `calib` command.
- **Temperature (stub)** — DS18B20 read via `DallasTemperature`; values outside
  −50…150 °C (e.g. `DEVICE_DISCONNECTED`) are flagged `ok:false`.
- **Battery (stub)** — a resistor divider on GPIO `36` feeds ADC1. The default
  `BATTERY_DIVIDER_RATIO = 4.0` implies, e.g., 33 kΩ / 10 kΩ. The firmware
  multiplies the ADC reading to mV, applies the `BATTERY_DIVIDER_RATIO`, and
  computes a 3S percentage against
  `BATTERY_FULL_MV`/`BATTERY_EMPTY_MV` (4.2 V → 3.3 V per cell). Any reading
  outside the plausible 8.0–13.1 V window (i.e. no divider hooked up) publishes
  `ok:false`, `mvolts:null`, `pct:null`.

## Firmware structure (`firmware/src/main.cpp`)

| Section | Role |
|---|---|
| `setup()` | PWM attach + safe defaults, relay/servo/US pins, `tempBus.begin()`, load NVS calib, `connectWiFi()`, `connectMQTT()` |
| `loop()` | Keepalive: reconnect (5 s) or drain `mqtt.loop()` + publish telemetry every 2 s |
| `connectMQTT()` | Connect with LWT (retained `"offline"` on `status`), subscribe `cmd`, publish retained `"online"` |
| `publishTelemetry()` | Reads all sensors, builds the JSON packet (below) |
| `onCommand()` | `move` · `speed` · `belt` · `feed` · `pickup` · `empty` · `home` · `calib` → each acks |
| `sendAck()` | `{c, v, ok, msg, seq, ts, spd}` on the `ack` topic |

Timestamps use NTP when reachable, otherwise uptime offset
(`bootTimeSec + millis()/1000`).

## Network and broker configuration

Wi-Fi credentials are **never committed**:

```
# one-time setup
cp include/secrets.h.example include/secrets.h
# then edit include/secrets.h with your SSID / password
```

`include/config.h` holds the rest: `MQTT_HOST` (broker LAN IP),
`MQTT_PORT`, device id/version, topics, pinout, motor/battery constants, and
pH calibration constants. `MQTT_USER`/`MQTT_PASSWORD` default to `null`
(anonymous broker).

## Build & flash

```bash
cd firmware
pio run -t upload
pio device monitor          # 115200 baud
```

Runtime deps are declared in `platformio.ini` and fetched by PlatformIO; no
manual library install. `build_flags = -DCORE_DEBUG_LEVEL=3` enables verbose
ESP-IDF logging.

## Calibration

```bash
# pH 7 buffer → calibrate the neutral point (persisted to NVS)
mosquitto_pub -h localhost -t aquasweep/pond-a01/cmd \
  -m '{"c":"calib","v":{"sensor":"ph","point":7}}'
# pH 4 buffer → derive slope (needs a fresh pH reading first)
mosquitto_pub -h localhost -t aquasweep/pond-a01/cmd \
  -m '{"c":"calib","v":{"sensor":"ph","point":4}}'
```

## Status of hardware integration

| Feature | State |
|---|---|
| Motors, belt relay, servo, ultrasonic, turbidity | Real (as original firmware) |
| pH / temperature / battery | **Stubs** — read gracefully, publish `ok:false` until hardware is wired |
| Autopilot / return-home / GPS / camera / ESC supervision | Not implemented (dashboard shows hardcoded placeholder values) |

See [feature-gap.md](feature-gap.md) for the full gap analysis.