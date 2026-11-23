# Guante Traductor

App para Android que traduce lengua de señas a texto y voz. Recibe por Bluetooth (BLE) lo que reconocen **dos guantes con sensores** y controla una **base giratoria**. La otra persona responde hablando: el micrófono transcribe su voz para que la persona sorda la lea en la misma pantalla.

Hecha con [Expo](https://expo.dev) (SDK 58), React Native y Expo Router.

## Qué hace

- **Conversación de dos vías:** lo que se firma con los guantes y lo que se dice en voz alta aparecen en un mismo hilo, en orden. El texto firmado se puede leer en voz alta.
- **Dos guantes a la vez:** el derecho y el izquierdo escriben en el mismo texto.
- **Base giratoria:** la app le manda órdenes de giro por Bluetooth.
- **Editor con sugerencias:** completa frases del catálogo con tildes y signos.
- **Entrenamiento del guante:** se hace desde la página web `Entrenando Guante.html` (ver abajo).
- **Privacidad:** el texto vive solo en memoria y se pierde al cerrar la app. No se guarda audio ni texto.

## Hardware

| Dispositivo | Placa | Nombre BLE | Código |
|---|---|---|---|
| Guante derecho | ESP32 + 5 sensores de flexión + MPU6050 | `GuanteLSP-D` | [guante_estatico/](guante_estatico/guante_estatico.ino) |
| Guante izquierdo | ESP32 + 5 sensores de flexión + MPU6050 | `GuanteLSP-I` | [guante_estatico/](guante_estatico/guante_estatico.ino) |
| Base giratoria | Arduino UNO + módulo HM-10 + servo | `BaseGiro` | [base_giratoria/](base_giratoria/base_giratoria.ino) |
| Base giratoria (alternativa) | ESP32 + servo | `BaseGiro` | [base_giratoria_esp32/](base_giratoria_esp32/base_giratoria_esp32.ino) |

**Guantes:** los dos usan el mismo firmware. Antes de cargarlo, cambia `DEVICE_NAME` según la mano: `"GuanteLSP-D"` para la derecha y `"GuanteLSP-I"` para la izquierda. El derecho también conecta con el nombre antiguo `GuanteLSP`.

**Base giratoria:** el Arduino UNO no tiene Bluetooth propio, así que necesita un módulo **HM-10** o un clon BLE (AT-09, BT05, MLT-BT05, CC41-A). Un HC-05 o HC-06 **no sirve**, porque es Bluetooth clásico. Si no tienes HM-10, usa la versión ESP32: se presenta igual que un HM-10 y la app no necesita cambios. Las conexiones de cables están al principio de cada sketch.

## Protocolo Bluetooth

Todos los dispositivos hablan con **líneas de texto terminadas en `\n`**.

**Guantes** (servicio Nordic UART `6e400001-…`):

| Línea | Significado |
|---|---|
| `S:nombre\|conf` | Seña reconocida: una letra (`S:A\|95`) o una palabra aprendida (`S:BUENOS DÍAS\|97`) |
| `S:ESPACIO` · `S:BORRAR` · `S:LIMPIAR` | Controles de edición del texto |
| `D:f1,f2,f3,f4,f5,roll,pitch,gyro` | Telemetría en vivo |
| `HELLO:…` · `OK:…` · `ERR:…` · `WARN:…` | Mensajes informativos |

**Base giratoria** (servicio `FFE0`, característica `FFE1`):

| App → base | Base → app |
|---|---|
| `PING` (al conectarse) | `PONG` |
| `G:<0-180>` | `OK:G:<grados>` o `ERR:<motivo>` |

## Cómo empezar

Requisitos: Node.js y un teléfono Android.

```bash
npm install
npx expo start
```

La conexión Bluetooth **no funciona en Expo Go ni en la web**. Para probar con los guantes hace falta instalar un build propio:

```bash
npx eas-cli@latest build --profile development --platform android
```

Instala el APK que genera EAS en el teléfono y luego ejecuta `npx expo start`.

En la web (`npx expo start --web`) no hay Bluetooth: solo se puede ver la pantalla de conversación con datos de demostración.

## Entrenar el guante

El entrenamiento se hace desde la PC con [Entrenando Guante.html](Entrenando%20Guante.html), que se conecta a un guante por Web Bluetooth. Desde ahí se calibra la mano (abierta y puño), se aprenden letras y frases nuevas (`LEARN` / `LEARNO`), se borran y se listan las señas, y se ven los sensores en vivo.

Chrome solo permite Bluetooth en `localhost` o `https`, así que la página no funciona abriéndola con doble clic. Hay que servirla desde la carpeta del proyecto:

```bash
python -m http.server 8000
```

Luego abre `http://localhost:8000/Entrenando%20Guante.html` en **Chrome o Edge de escritorio** (Firefox y Safari no tienen Web Bluetooth). Entrena un guante a la vez; la página reconoce los dos nombres (`GuanteLSP-D` y `GuanteLSP-I`).

## Probar con el hardware

1. Enciende los dos guantes y la base, a menos de un metro del teléfono.
2. En la pantalla de conexión, toca **Conectar dispositivos**. La app los busca uno por uno y cada fila debe llegar a **Listo**.
3. Con la base lista, usa los botones **Izquierda / Centro / Derecha** para probar el giro.
4. Toca **Iniciar conversación**.

Cada dispositivo tiene su propio botón **Conectar / Desconectar** por si uno falla. El Monitor Serie de cada placa muestra lo que recibe y envía.

## Estructura

```
src/
  app/          Pantallas (Expo Router)
    index.tsx         Conexión de los 3 dispositivos
    conversacion.tsx  Conversación de dos vías
    session.tsx       Editor con sugerencias
  ble/          Cliente Bluetooth y protocolo
  hooks/        Estado del guante, voz y turnos
  domain/       Frases y edición del texto
  components/   Componentes visuales
  constants/    Tema y etiquetas de estado
guante_estatico/       Firmware de los guantes (ESP32)
base_giratoria/        Base con Arduino UNO + HM-10
base_giratoria_esp32/  Base alternativa con ESP32
Entrenando Guante.html Entrenamiento y diagnóstico del guante (Web Bluetooth)
```

## Comandos útiles

```bash
npx expo lint       # revisar el código
npx tsc --noEmit    # revisar los tipos
npx expo-doctor     # diagnosticar dependencias
```
