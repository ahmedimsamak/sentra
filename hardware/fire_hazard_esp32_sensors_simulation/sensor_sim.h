/*
============================================================
  Edge-AI Fire Hazard Detection System
  Sensor Simulator — Public Interface

  Drop-in replacement for physical DHT22 + MQ-2 reads.
  Emits realistic readings that match train_model.py ranges:

     SAFE    : T 15–38  | H 45–90  | G 30–150
     WARNING : T 38–65  | H 20–45  | G 150–450
     FIRE    : T 65–100 | H 5–22   | G 450–1000

  USAGE (in the main .ino):
      setup():  simInit();
      loop():   simUpdate();
                float t, h, g;
                simReadSensors(t, h, g);   // identical signature to real reads
============================================================
*/

#pragma once
#include <Arduino.h>

/**
 * Initialise the simulator. Call once in setup(),
 * after Serial.begin() so log lines are visible.
 */
void simInit();

/**
 * Advance the simulator by one step. Call at the top of loop().
 * Internally throttled to 10 Hz — safe to call every iteration.
 */
void simUpdate();

/**
 * Read the current simulated values.
 * Signature intentionally matches a real DHT22 + MQ-2 read
 * so it can replace the physical sensor call with no other changes.
 *
 * @param temperature  °C, 0.1 resolution
 * @param humidity     %RH, 0.1 resolution
 * @param gasLevel     ppm, integer resolution
 */
void simReadSensors(float &temperature, float &humidity, float &gasLevel);

/**
 * Current internal state name: "SAFE" | "WARNING" | "FIRE".
 * Useful for debug logging only.
 */
const char* simStateName();
