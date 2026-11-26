# Guante Traductor

App para Android que traduce lengua de señas a texto y voz. Recibe por Bluetooth (BLE) lo que reconocen **dos guantes con sensores** y controla una **base giratoria**. La otra persona responde hablando: el micrófono transcribe su voz para que la persona sorda la lea en la misma pantalla.

Hecha con [Expo](https://expo.dev) (SDK 58), React Native y Expo Router.

## Qué hace

- **Pantalla grande en horizontal:** el teléfono va sobre la base giratoria, entre las dos personas, y muestra un solo texto lo más grande posible.
- **Guantes → voz:** lo que firma la persona sorda se dice en voz alta y la base gira la pantalla hacia el oyente.
- **Voz → texto:** el micrófono escucha solo desde que se abre la conversación. Lo que dice el oyente aparece en grande y la base gira la pantalla hacia la persona sorda para que lo lea.
- **Una sola conexión, "Guantes":** el cerebro (Arduino UNO Q) recibe los dos guantes y la app solo se conecta a él.
- **Entrenamiento del guante:** se hace desde la página web `Entrenando Guante.html` (ver abajo).
- **Privacidad:** el texto vive solo en memoria y se pierde al cerrar la app. No se guarda audio ni texto.

## Hardware

| Dispositivo | Placa | Nombre BLE | Código |
|---|---|---|---|
| Cerebro | Arduino UNO Q | `GuanteLSP-D` | [cerebro/](cerebro/cerebro.py) |
| Guante derecho | ESP32 + 5 sensores de flexión + MPU6050 | `GuanteLSP-SD` | [guante_estatico/](guante_estatico/guante_estatico.ino) |
| Guante izquierdo | ESP32 + 5 sensores de flexión + MPU6050 | `GuanteLSP-SI` | [guante_estatico/](guante_estatico/guante_estatico.ino) |
| Base giratoria | Arduino UNO + módulo HM-10 + servo | `BaseGiro` | [base_giratoria/](base_giratoria/base_giratoria.ino) |
| Base giratoria (alternativa) | ESP32 + servo | `BaseGiro` | [base_giratoria_esp32/](base_giratoria_esp32/base_giratoria_esp32.ino) |

**Cerebro (Arduino UNO Q):** [cerebro/cerebro.py](cerebro/cerebro.py) corre en el Linux de la placa. Recibe la telemetría `D:` de los dos guantes, reconoce las señas con k-NN (scikit-learn) mirando ventanas de ~0.5 s, así que entiende tanto señas quietas como señas con movimiento, y se anuncia ante la app como `GuanteLSP-D`; en la app aparece como **Guantes**. Por defecto (`--sin-qwen` lo apaga) junta las señas y Qwen 2.5 1.5B (Ollama, en la misma placa) arma la frase cuando la persona hace una pausa de 1.5 s; tarda unos 6 s, y solo se usa cuando hay varias palabras (una sola seña o un deletreo salen al instante). Cada frase armada se recuerda en `frases.json`: la segunda vez sale al instante, y en la página se puede corregir o escribir de antemano. La seña especial `TRANSICION` (pasar de una seña a otra) se graba como `REPOSO` y nunca se escribe: evita que los cambios de seña se confundan con señas con movimiento. Con el cerebro, los guantes se llaman `GuanteLSP-SD` y `GuanteLSP-SI`. Instrucciones de uso al inicio del script. Arranca solo al prender la placa con [cerebro.service](cerebro/cerebro.service) (instalación dentro del archivo).

**Guantes:** los dos usan el mismo firmware. Antes de cargarlo, cambia `DEVICE_NAME` según la mano: `"GuanteLSP-SD"` para la derecha y `"GuanteLSP-SI"` para la izquierda. Para probar un guante sin cerebro, directo con la app, usa `"GuanteLSP-D"`.

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

Las señas se graban en el cerebro, desde la página que sirve la placa: la placa crea su propia red Wi-Fi al prenderse (**`GuanteLSP`**, contraseña **`guantelsp`**). Conecta el celular o la PC a esa red y abre **`http://guante.local:8000`** (o `http://10.42.0.1:8000`). En el celular, apaga los datos móviles antes; si Android avisa que la red no tiene internet, elige mantener la conexión. [cerebro/hoja_qr.html](cerebro/hoja_qr.html) tiene los dos códigos QR (Wi-Fi y página) para imprimir y pegar en la caja. Mientras tanto la placa no tiene internet (no le hace falta). Para volver al Wi-Fi de casa: `nmcli connection modify GuanteLSP connection.autoconnect no` y reiniciar. Ahí se calibra cada guante, se ven los sensores en vivo, se graba una lista de señas con cuenta atrás, se prueba al instante qué reconoce, se borran señas y se descarga una copia. Los guantes se reconectan solos si se apagan. El guante ya no aprende señas; solo hay que calibrarlo.

La calibración (mano abierta y puño) se hace desde la PC con [Entrenando Guante.html](Entrenando%20Guante.html), que se conecta a un guante por Web Bluetooth y también muestra los sensores en vivo. Sus botones de aprender, borrar y listar señas ya no hacen nada con el firmware v3. También se puede calibrar desde el Monitor Serie (115200) con `CAL_OPEN` y `CAL_FIST`.

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

### La base busca a la persona sorda

La cámara USB va pegada arriba del teléfono, sobre la base, y su cable va a la laptop. La base barre de 0° a 180° parando para mirar; la persona que levanta las dos manos a la altura de la cara (como un mimo) queda elegida y la base la sigue. Solo lo que firma esa persona va al teléfono. Cuando el oyente habla, la app manda `T:OYENTE` y la base gira hacia él; al terminar la frase manda `T:SORDO` y vuelve a la persona sorda. Si la persona sorda no aparece por 5 s, la base vuelve a buscar.

Los ajustes están al principio de la clase `Base`, en [cerebro/cerebro.py](cerebro/cerebro.py). Si al seguir una cara la base se aleja en vez de centrarla, cambia `SENTIDO_BASE` a `-1`.

## Estructura

```
src/
  app/          Pantallas (Expo Router)
    index.tsx         Conexión de los guantes y la base
    conversacion.tsx  Conversación de dos vías
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
