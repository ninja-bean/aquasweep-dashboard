# Stub Hardware Integration & Battery Voltage System Design

Three sensors are **software-complete but hardware-absent**: the firmware reads
them every telemetry cycle and publishes `ok:false` / `null` when their
hardware is not connected. This guide explains exactly how to wire each one,
and covers the **battery voltage sensing system** in full detail.

> Nothing in `firmware/src/main.cpp` must change to "activate" these — the
> reads are already implemented. You only need to (a) wire the hardware,
> (b) set the right constants in `firmware/include/config.h`, and (c) calibrate
> where appropriate.

| Stub sensor | Pin | ADC channel | Status without hardware |
|---|---|---|---|
| pH — PH-4502C analog module | GPIO `34` | ADC1 CH6 (input-only) | `ph.ok:false`, `ph.val:null` |
| Temperature — DS18B20 | GPIO `33` | OneWire | `temp.ok:false`, `temp.c:null` |
| Battery — resistor divider | GPIO `36` | ADC1 CH0 (input-only) | `batt.ok:false`, `batt.mvolts/pct:null` |

---

## 1. pH sensor (PH-4502C)

### Wiring

| PH-4502C module pin | ESP32 / supply |
|---|---|
| `VCC` | `3.3 V` *(ensure the analog output stays ≤ 3.3 V)* |
| `GND` | ESP32 `GND` (common ground — required) |
| `AO` / `PO` (analog out) | GPIO `34` |
| `DO` (digital threshold) | not used (optional) |

Notes:

- **Power at 3.3 V**, not 5 V: the module's analog output is rail-relative and
  can exceed the ESP32's 3.3 V limit if the module runs from 5 V. The FIRMWARE
  sits in the plausible range, so 3.3 V keeps every reading valid.
- Keep the probe wet (storage solution or in-use). A dry electrode drifts.
- Route the coax probe lead away from motor PWM and relay wiring.

### Firmware behaviour (`readPH`)

Reads GPIO 34, averages 16 samples, converts to mV (`adc/4095 × 3300`), and
only publishes `ph.val` when the reading is inside the plausible
**0.3–3.1 V** band. Otherwise `ok:false`.

### Calibration (two buffers, persisted in NVS)

```bash
# 1. Probe in pH 7 buffer → sets the neutral voltage
mosquitto_pub -h localhost -t aquasweep/pond-a01/cmd \
  -m '{"c":"calib","v":{"sensor":"ph","point":7}}'

# 2. Probe in pH 4 buffer → derives the slope
mosquitto_pub -h localhost -t aquasweep/pond-a01/cmd \
  -m '{"c":"calib","v":{"sensor":"ph","point":4}}'
```

Constants: `PH_NEUTRAL_MV` (2500), `PH_SLOPE_MV_PER_PH` (59.16, Nernst @ 25 °C).
Calibration overrides are stored in NVS and survive reboots.

---

## 2. Temperature sensor (DS18B20)

### Wiring

Waterproof stainless probe (TO-92 works too):

| DS18B20 lead | ESP32 |
|---|---|
| **Red** (VDD) | `3.3 V` |
| **Black** (GND) | `GND` |
| **Yellow/White** (DQ) | GPIO `33`, **plus a `4.7 kΩ` pull-up from DQ to `3.3 V`** |

The `4.7 kΩ` pull-up is mandatory — OneWire is an open-drain bus and will not
read without it.

### Firmware behaviour (`readTemp`)

`DallasTemperature` over OneWire on GPIO 33; values outside −50…150 °C
(including the `DEVICE_DISCONNECTED` −127 °C sentinel) are flagged
`ok:false`.

Notes:

- Multiple probes may share the bus; the firmware currently reads
  `getTempCByIndex(0)` only.
- In a pond environment, the probe's metal sheath shares the water path with
  the boat's ground — acceptable for this prototype. The ESP32 power and the
  motors share the same DC pack.

---

## 3. Battery voltage sensing system design

This is the "show me the battery level" feature. The design goal: read a
**3S Li-ion pack (9.9–12.6 V, nominal 11.1 V)** with a resistor divider onto an
input-only ADC pin without exceeding the ESP32's 3.3 V rail, then convert to a
% in the firmware.

### 3.1 Divider math

A two-resistor divider scales battery voltage into the ADC range:

```
V_adc = V_batt × R2 / (R1 + R2)   ⇒   V_batt = V_adc × (R1 + R2) / R2
                                              └─────────┬────────┘
                                          BATTERY_DIVIDER_RATIO (K)
```

Design targets for a 3S pack:

| Quantity | Value |
|---|---|
| Full / nominal / empty | 12.6 V / 11.1 V / 9.9 V |
| Absolute max (firmware window) | 13.1 V |
| ADC rails | 0 – 3.3 V |
| Design point (max V → ADC) | ≤ **3.0 V** (headroom below the non-linear ADC top) |

Minimum ratio: `K ≥ 13.1 / 3.0 ≈ 4.37`. From `K = 1 + R1/R2`:

| R1 (upper) | R2 (lower) | K | 12.6 V → ADC | 9.9 V → ADC | Notes |
|---|---|---|---|---|---|
| **33 kΩ** | **10 kΩ** | **4.30** | **2.93 V** | **2.30 V** | **Recommended** — low source impedance, linear range |
| 100 kΩ | 30 kΩ | 4.33 | 2.91 V | 2.29 V | Lower battery drain |
| 100 kΩ | 33 kΩ | 4.03 | 3.13 V | 2.46 V | Too close to the ADC top; fine but less headroom |

`R2 ≤ 10 kΩ` keeps source impedance low enough for the ADC punch-through
(see 3.3). Suggestion: **R1 = 33 kΩ, R2 = 10 kΩ (1 % tolerance)**.

### 3.2 Schematic

```
        +─── battery + (pack positive)
        │
        R1 33kΩ
        │
        ├──────────────► GPIO 36  (ADC1 CH0)
        │
        R2 10kΩ   ──┤ 0.1 µF (across R2, optional but recommended)
        │
        └─── battery − / system GND (must be the SAME ground as the ESP32)
```

### 3.3 Hardware rules

1. **Common ground.** The divider returns to the same GND as the ESP32 — a
   floating reference makes every reading wrong.
2. **Input-only pin.** GPIO 36 is input-only: no internal pull-up/pull-down,
   never drive it.
3. **Never exceed 3.3 V on the pin.** Check with the pack fully charged
   *before* plugging into the ESP32.
4. **Low-pass / sample cap (recommended).** A `0.1 µF` capacitor across R2
   stabilises the ADC sample-and-hold and filters motor spikes. A `1 kΩ`
   series resistor makes a ~1.6 kHz RC filter.
5. **ADC accuracy.** ESP32 ADC1 is non-linear near the rails and roughly
   ±20–60 mV uncalibrated (±1–2 % of 12.6 V). Average several reads in the
   firmware for stability (the battery read is currently a single
   `analogRead`).
6. **No significant battery drain.** With 43 kΩ total, the divider draws
   ~260 µA at 11.1 V — fine for a Li-ion pack.

### 3.4 Firmware constants (`config.h`)

```cpp
// Must equal the PHYSICAL ratio (R1+R2)/R2 of your divider:
constexpr float BATTERY_DIVIDER_RATIO = 4.3f;   // 33k/10k → 4.3

// Chemistry. 3S defaults; for other packs change FULL/EMPTY *and* the window:
constexpr float BATTERY_FULL_MV  = 4.2f * 1000.0f * 3.0f;  // 12600 mV (3S)
constexpr float BATTERY_EMPTY_MV = 3.3f * 1000.0f * 3.0f;  // 9900 mV  (3S)
constexpr float BATTERY_MAX_PLAUSIBLE_MV = 13100.0f;       // widen for 4S
constexpr float BATTERY_MIN_PLAUSIBLE_MV = 8000.0f;
```

- 2S pack: `FULL = 8400`, `EMPTY = 6600`, window ≈ 5500–8800, ratio for
  8.4 V max → `K ≥ 8.4/3.0 ≈ 2.8`.
- 4S pack: `FULL = 16800`, `EMPTY = 13200`, window ≈ 11000–17100, max 16.8 V
  → you need attenuation for 16.8 V to ≤3.0 V, i.e. `K ≈ 5.6` (e.g. 47 kΩ /
  10 kΩ = 5.7).

### 3.5 Verify the reading

With the divider wired and firmware flashed:

```bash
mosquitto_sub -h localhost -t 'aquasweep/#' -v
# expect: "sensors": { "batt": { "mvolts": 11xxx, "pct": 6x, "ok": true } }
```

- Dashboard header and Live battery gauge now show the live %.
- **Trust but verify:** measure the pack with a multimeter and compare to
  `mvolts`. If it disagrees by a constant factor, apply an effective-ratio
  correction: `effective_K = (measured V / reported V) × BATTERY_DIVIDER_RATIO`
  and put that in `config.h`.

### 3.6 Nothing wired yet

Until a divider is boxed, GPIO 36 floats; the plausible-window gate
publishes `batt.ok:false`, which is exactly the current Telemetry behaviour —
dashboard shows `—`. That is the correct "missing hardware" state.

---

## 4. Verification checklist

1. Wire the sensor(s) per the tables; double-check common ground and 3.3 V.
2. Set `BATTERY_DIVIDER_RATIO` to the physical divider value.
3. `cd firmware && pio run -t upload && pio device monitor`
4. `mosquitto_sub -h localhost -t 'aquasweep/#' -v`
5. Expect `ok:true` and live values for everything you wired; `ok:false` only
   for hardware you have not yet connected.
6. Calibrate pH with the two-buffer `calib` commands.
7. Cross-check battery `mvolts` against a multimeter.