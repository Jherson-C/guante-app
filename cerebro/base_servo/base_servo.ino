/*
 * BASE GIRATORIA en el Arduino UNO Q (microcontrolador STM32).
 *
 * El cerebro (cerebro.py, en el Linux de la placa) recibe "G:<grados>" de la app
 * y llama a girar(grados) por arduino-router. Este sketch mueve el servo suave.
 *
 * CONEXIONES
 *   Servo MG996R: naranja (señal) -> pin D9
 *                 rojo (+)       -> + de una FUENTE EXTERNA 5-6 V, 3 A o más
 *                 café (-)       -> GND de la fuente Y GND del UNO Q (tierra común)
 *   NUNCA alimentes el MG996R desde el 5V del UNO Q: pide hasta 2.5 A y reinicia la placa.
 *
 * No usar Bluetooth (ArduinoBLE) en este sketch: le quita el Bluetooth al cerebro.
 */

#include <Arduino_RouterBridge.h>
#include <Servo.h>

#define SERVO_PIN 9
#define ANGULO_INICIAL 90
// Giro suave: 1 grado cada PASO_MS (180° en ~1.4 s). Un salto directo con el
// MG996R lanza el teléfono de la base y da un pico de corriente.
#define PASO_MS 8

Servo servo;
volatile int objetivo = ANGULO_INICIAL;  // lo cambia girar(), desde el hilo del Bridge
int actual = ANGULO_INICIAL;

void girar(int grados) {
  objetivo = constrain(grados, 0, 180);
}

void setup() {
  servo.attach(SERVO_PIN);
  servo.write(actual);
  Bridge.begin();
  Bridge.provide("girar", girar);
}

void loop() {
  if (actual != objetivo) {
    actual += (objetivo > actual) ? 1 : -1;
    servo.write(actual);
  }
  delay(PASO_MS);
}
