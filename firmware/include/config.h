#pragma once

#include <Arduino.h>

// =====================================================
//                      WIFI
//  Credentials live in secrets.h — a gitignored file
//  (copy include/secrets.h.example → include/secrets.h
//  and fill in your own Wi-Fi network to build).
// =====================================================
#include "secrets.h"

// =====================================================
//                      MQTT BROKER
//  Local Mosquitto — TCP on 1883. Point MQTT_HOST at the
//  machine running Mosquitto (use its LAN IP).
// =====================================================
constexpr const char *MQTT_HOST = "10.132.203.190";
constexpr uint16_t MQTT_PORT = 1883;
constexpr const char *MQTT_USER = nullptr; // null = no auth (allow_anonymous true)
constexpr const char *MQTT_PASSWORD = nullptr;

// =====================================================
//                   DEVICE IDENTITY
// =====================================================
constexpr const char *DEVICE_ID = "pond-a01";
constexpr const char *FW_VERSION = "2.1.0";

// =====================================================
//                       MQTT TOPICS
// =====================================================
constexpr const char *TOPIC_TELEMETRY = "aquasweep/pond-a01/telemetry";
constexpr const char *TOPIC_CMD = "aquasweep/pond-a01/cmd";
constexpr const char *TOPIC_ACK = "aquasweep/pond-a01/ack";
constexpr const char *TOPIC_STATUS = "aquasweep/pond-a01/status"; // retained + LWT

// =====================================================
//                   TELEMETRY CADENCE
// =====================================================
constexpr uint32_t TELEMETRY_MS = 2000;

// =====================================================
//              MOTOR THROTTLE (PWM speed)
//  The four H-bridge inputs are driven by LEDC PWM
//  channels at MOTOR_PWM_FREQ. Each move command applies
//  the current g_speedPct (0-100). The dashboard sends a
//  {"c":"speed", v} command to change it on the fly.
// =====================================================
constexpr uint32_t MOTOR_PWM_FREQ = 5000; // Hz — audible but smooth on DC motors
constexpr uint8_t MOTOR_DEFAULT_SPEED_PCT = 60;

// =====================================================
//  PINOUT — KEPT IDENTICAL TO ORIGINAL FIRMWARE
//  (only new sensor pins were added)
// =====================================================

// Wheel motors (H-bridge)
#define PIN_IN1 17
#define PIN_IN2 15
#define PIN_IN3 4
#define PIN_IN4 16

// Conveyor belt relay — ACTIVE LOW (LOW = ON)
#define PIN_BELT_RELAY 27

// Fish feeder servo (bit-bang PWM)
#define PIN_SERVO 25

// Ultrasonic (bin fullness / obstacle)
#define PIN_TRIG 22
#define PIN_ECHO 23

// Turbidity (analog, 0-4095)
#define PIN_TURBIDITY 32

// --- NEW sensors (stubs; graceful when not connected) ---

// pH sensor — PH-4502C module analog out (~0..3.0 V on 3.3 V rail)
// ESP32 ADC1 channel 6 — input only.
#define PIN_PH 34

// Temperature — DS18B20 probe on OneWire bus
#define PIN_TEMP 33

// Battery pack — read via a resistor divider on ADC pin (ADC1, input only).
#define PIN_BATTERY 36

// =====================================================
//              PH CALIBRATION (PH-4502C)
//  pH = 7.0 + (neutralVoltage_mV - sampleVoltage_mV) / slope_mV_per_pH
//  Defaults assume a ~2.50 V midpoint (pH 7). Tune with a buffer via the
//  MQTT calib command, which persists to NVS:
//    {"c":"calib","v":{"sensor":"ph","point":7}}
//    {"c":"calib","v":{"sensor":"ph","point":4}}
// =====================================================
constexpr float PH_NEUTRAL_MV = 2500.0f;
constexpr float PH_SLOPE_MV_PER_PH = 59.16f; // Nernst slope @ 25 °C

// =====================================================
//               BATTERY (3S Li-ion pack)
//  Percentage is computed in the firmware and published
//  as sensors.batt.pct — the dashboard reads it directly
//  instead of re-deriving it from the raw voltage.
//
//  BATTERY_DIVIDER_RATIO = (R_upper + R_lower)/R_lower.
//  Full = 4.2 V/cell, 0% floor = 3.3 V/cell. Readings
//  outside the plausible window (i.e. no divider boxed)
//  publish ok:false like the other sensor stubs.
// =====================================================
constexpr float BATTERY_DIVIDER_RATIO = 4.0f;             // e.g. 33 kΩ + 10 kΩ → ~4.3:1
constexpr float BATTERY_FULL_MV = 4.2f * 1000.0f * 3.0f;  // 12600 mV (3S)
constexpr float BATTERY_EMPTY_MV = 3.3f * 1000.0f * 3.0f; // 9900 mV (3S)
constexpr float BATTERY_MAX_PLAUSIBLE_MV = 13100.0f;
constexpr float BATTERY_MIN_PLAUSIBLE_MV = 8000.0f;

// NVS keys for persisted pH calibration
constexpr const char *NVS_NAMESPACE = "aquasweep";
constexpr const char *NVS_KEY_PH_NEUTRAL = "ph_neutral";
constexpr const char *NVS_KEY_PH_SLOPE = "ph_slope";