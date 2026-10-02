/*
============================================================
  Edge-AI Fire Hazard Detection System
  Sensor Simulator — Implementation

  Realism features:
    - Smoothed transitions (thermal / diffusion inertia)
    - DHT22 resolution: 0.1 °C / 0.1 %RH, low noise
    - MQ-2 resolution: 1 ppm, higher noise + rare spikes
    - 3-state Markov-like machine (SAFE / WARNING / FIRE)
    - Hysteresis: SAFE holds long, FIRE can extinguish
    - Central-tendency sampling (avg of 3 uniforms)
    - Hardware RNG (esp_random) — no fixed seed
============================================================
*/

#include "sensor_sim.h"

// ============================================================
//  INTERNAL STATE  (file-scope, hidden from other translation units)
// ============================================================
namespace {

enum SimState : uint8_t { SIM_SAFE = 0, SIM_WARNING = 1, SIM_FIRE = 2 };

// --- Sensor ranges (must match train_model.py) ---
struct Range { float tMin, tMax; float hMin, hMax; float gMin, gMax; };

const Range RANGE_SAFE    = { 15.0f,  38.0f,  45.0f,  90.0f,   30.0f,  150.0f };
const Range RANGE_WARNING = { 38.0f,  65.0f,  20.0f,  45.0f,  150.0f,  450.0f };
const Range RANGE_FIRE    = { 65.0f, 100.0f,   5.0f,  22.0f,  450.0f, 1000.0f };

// --- Runtime state ---
SimState      g_state          = SIM_SAFE;
float         g_temp           = 25.0f;
float         g_hum            = 60.0f;
float         g_gas            = 80.0f;
float         g_tempTarget     = 25.0f;
float         g_humTarget      = 60.0f;
float         g_gasTarget      = 80.0f;
unsigned long g_lastUpdateMs   = 0;
unsigned long g_stateHoldMs    = 0;
unsigned long g_nextTargetMs   = 0;

// ============================================================
//  RANDOM HELPERS
// ============================================================
inline float randF(float lo, float hi) {
    return lo + ((float)esp_random() / (float)UINT32_MAX) * (hi - lo);
}

// Approximate Gaussian via average of 3 uniforms (CLT)
inline float randG(float lo, float hi) {
    return (randF(lo, hi) + randF(lo, hi) + randF(lo, hi)) / 3.0f;
}

// ============================================================
//  QUANTIZATION
// ============================================================
inline float quantizeDHT(float v) { return roundf(v * 10.0f) / 10.0f; }
inline float quantizeMQ (float v) { return roundf(v); }

// ============================================================
//  LOW-PASS APPROACH (smooth drift toward target)
// ============================================================
inline float approach(float current, float target, float alpha) {
    return current + (target - current) * alpha;
}

// ============================================================
//  TARGET SELECTION
// ============================================================
void pickTargetForState(SimState s) {
    const Range* r =
        (s == SIM_SAFE)    ? &RANGE_SAFE    :
        (s == SIM_WARNING) ? &RANGE_WARNING :
                             &RANGE_FIRE;

    g_tempTarget = randG(r->tMin, r->tMax);
    g_humTarget  = randG(r->hMin, r->hMax);
    g_gasTarget  = randG(r->gMin, r->gMax);

    // Hold this target for 20–40 s before re-rolling within the same state
    g_nextTargetMs = millis() + (unsigned long)randF(20000.0f, 40000.0f);
}

// ============================================================
//  STATE MACHINE (weighted, with hysteresis)
// ============================================================
void maybeTransition() {
    // Minimum dwell time before any state change
    if (millis() - g_stateHoldMs < 15000UL) return;

    const uint32_t r = esp_random() % 100;

    switch (g_state) {
        case SIM_SAFE:
            if (r < 5) {                        // 5 % → WARNING
                g_state = SIM_WARNING;
                g_stateHoldMs = millis();
                Serial.println("[SIM] State -> WARNING");
                pickTargetForState(g_state);
            }
            break;

        case SIM_WARNING:
            if (r < 20) {                       // 20 % → FIRE
                g_state = SIM_FIRE;
                g_stateHoldMs = millis();
                Serial.println("[SIM] State -> FIRE");
                pickTargetForState(g_state);
            } else if (r < 50) {                // 30 % → SAFE
                g_state = SIM_SAFE;
                g_stateHoldMs = millis();
                Serial.println("[SIM] State -> SAFE");
                pickTargetForState(g_state);
            }
            break;

        case SIM_FIRE:
            if (r < 25) {                       // 25 % → WARNING (extinguished)
                g_state = SIM_WARNING;
                g_stateHoldMs = millis();
                Serial.println("[SIM] State -> WARNING (extinguished)");
                pickTargetForState(g_state);
            }
            break;
    }
}

} // anonymous namespace

// ============================================================
//  PUBLIC API
// ============================================================
void simInit() {
    randomSeed(esp_random());       // seed from hardware RNG

    g_state        = SIM_SAFE;
    g_stateHoldMs  = millis();
    g_lastUpdateMs = millis();
    pickTargetForState(g_state);

    // Snap to target so the first reading is already valid
    g_temp = g_tempTarget;
    g_hum  = g_humTarget;
    g_gas  = g_gasTarget;

    Serial.println("[SIM] Sensor simulator initialized (state=SAFE)");
}

void simUpdate() {
    const unsigned long now = millis();

    // Throttle to 10 Hz
    if (now - g_lastUpdateMs < 100UL) return;
    g_lastUpdateMs = now;

    if (now >= g_nextTargetMs) {
        pickTargetForState(g_state);
    }

    maybeTransition();

    // Different response rates per sensor (thermal vs. diffusion)
    g_temp = approach(g_temp, g_tempTarget, 0.05f);
    g_hum  = approach(g_hum,  g_humTarget,  0.10f);
    g_gas  = approach(g_gas,  g_gasTarget,  0.15f);

    // Sensor-specific noise
    float tNoise = randG(-0.10f, 0.10f);
    float hNoise = randG(-0.20f, 0.20f);
    float gNoise = randG(-3.00f, 3.00f);

    // MQ-2 occasional spike (1 in 50 updates)
    if ((esp_random() % 50) == 0) {
        gNoise += randG(-15.0f, 15.0f);
    }

    g_temp = quantizeDHT(g_temp + tNoise);
    g_hum  = quantizeDHT(g_hum  + hNoise);
    g_gas  = quantizeMQ (g_gas  + gNoise);

    // Clamp to app.py sanity bounds
    if (g_temp < 0.0f)    g_temp = 0.0f;
    if (g_temp > 150.0f)  g_temp = 150.0f;
    if (g_hum  < 0.0f)    g_hum  = 0.0f;
    if (g_hum  > 100.0f)  g_hum  = 100.0f;
    if (g_gas  < 0.0f)    g_gas  = 0.0f;
    if (g_gas  > 1500.0f) g_gas  = 1500.0f;
}

void simReadSensors(float &temperature, float &humidity, float &gasLevel) {
    temperature = g_temp;
    humidity    = g_hum;
    gasLevel    = g_gas;
}

const char* simStateName() {
    switch (g_state) {
        case SIM_SAFE:    return "SAFE";
        case SIM_WARNING: return "WARNING";
        case SIM_FIRE:    return "FIRE";
        default:          return "?";
    }
}

