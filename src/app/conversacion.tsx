/**
 * Conversación en horizontal, a pantalla completa.
 *
 * El teléfono va sobre la base giratoria entre las dos personas y muestra un
 * solo texto, en grande:
 *   - La persona sorda firma con los guantes → la app lo dice en voz alta y la
 *     base gira la pantalla hacia el oyente.
 *   - El oyente habla → el micrófono lo transcribe en grande y la base gira la
 *     pantalla hacia la persona sorda para que lo lea.
 * El micrófono escucha solo desde que se abre la pantalla (manos libres).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ANGULO_BASE } from '@/ble/protocol';
import { BotonControl } from '@/components/controles';
import { Cristal } from '@/components/cristal';
import { Fondo } from '@/components/fondo';
import { Icono } from '@/components/icono';
import { IndicadorTurno } from '@/components/indicador-turno';
import { PantallaGrande } from '@/components/pantalla-grande';
import { COLORES_FASE, ETIQUETAS_CORTAS, ETIQUETAS_FASE } from '@/constants/guante-fases';
import { COLOR, FUENTE } from '@/constants/tema';
import type { Fuente } from '@/constants/tema';
import { useGuante } from '@/hooks/use-guante';
import { useReconocimientoVoz } from '@/hooks/use-reconocimiento-voz';
import { useTextoAVoz } from '@/hooks/use-texto-a-voz';
import { useTurnos } from '@/hooks/use-turnos';

const ANCHO_RIEL = 84;

function salir() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export default function Conversacion() {
  useKeepAwake();

  const {
    texto,
    fase,
    dispositivos,
    confianza,
    simulado,
    tele,
    totalFrames,
    framesInvalidos,
    debugFrames,
    conectar,
    desconectar,
    enviarBase,
    limpiarTexto,
    inyectarLinea,
  } = useGuante();

  const { hablar, detener: detenerVoz, hablando } = useTextoAVoz();
  // Lo firmado se lee en voz alta por defecto: es la forma en que el oyente "escucha" al sordo.
  const [autoVoz, setAutoVoz] = useState(true);
  const [senales, setSenales] = useState(false);

  // Lo que dice la voz y el hilo se necesitan mutuamente: la voz entrega frases
  // finales al hilo, y el hilo cierra el turno del guante cuando alguien habla.
  const agregarVozRef = useRef<(texto: string) => void>(() => {});
  const cerrarGuanteRef = useRef<() => void>(() => {});

  const {
    escuchando,
    parcial,
    error: errorVoz,
    iniciar,
    detener,
  } = useReconocimientoVoz((frase) => {
    cerrarGuanteRef.current();
    agregarVozRef.current(frase);
  });

  const { turnos, guanteVivo, agregarVoz, cerrarGuante, limpiar } = useTurnos({
    texto,
    parcial,
    alCerrarGuante: (cerrado) => {
      if (autoVoz) hablar(cerrado);
    },
  });

  useEffect(() => {
    agregarVozRef.current = agregarVoz;
    cerrarGuanteRef.current = cerrarGuante;
  });

  // Manos libres: el micrófono empieza a escuchar al abrir la pantalla.
  useEffect(() => {
    if (Platform.OS !== 'web') void iniciar();
    // Solo al montar; el usuario puede pausarlo con el botón.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mientras el teléfono habla, el micrófono se pausa para no transcribirse a sí mismo.
  const reanudarRef = useRef(false);
  useEffect(() => {
    if (hablando && escuchando) {
      reanudarRef.current = true;
      detener();
    } else if (!hablando && reanudarRef.current) {
      reanudarRef.current = false;
      void iniciar();
    }
  }, [hablando, escuchando, detener, iniciar]);

  const alternarMic = useCallback(() => {
    reanudarRef.current = false;
    if (escuchando) detener();
    else void iniciar();
  }, [escuchando, detener, iniciar]);

  const borrarTodo = useCallback(() => {
    limpiarTexto();
    limpiar();
    detenerVoz();
  }, [limpiarTexto, limpiar, detenerVoz]);

  const terminar = useCallback(() => {
    reanudarRef.current = false;
    detener();
    detenerVoz();
    desconectar();
    router.replace('/');
  }, [detener, detenerVoz, desconectar]);

  // --- Quién tiene la palabra -------------------------------------------
  const vivoFuente: Fuente | null = parcial ? 'voz' : guanteVivo ? 'guante' : null;
  const ultimo = turnos.length > 0 ? turnos[turnos.length - 1] : null;
  const quienHabla = vivoFuente ?? ultimo?.fuente ?? null;

  const actual = parcial
    ? { fuente: 'voz' as const, texto: parcial, vivo: true }
    : guanteVivo
      ? { fuente: 'guante' as const, texto: guanteVivo, vivo: true }
      : ultimo
        ? { ...ultimo, vivo: false }
        : null;
  const previo = vivoFuente ? ultimo : turnos.length > 1 ? turnos[turnos.length - 2] : null;

  // --- Base giratoria: la pantalla mira a quien tiene que leer -------------
  // Habla el oyente → gira hacia la persona sorda; firma el sordo → hacia el oyente.
  const baseLista = dispositivos.base.fase === 'operativo';
  const mirarA = quienHabla === 'voz' ? 'sordo' : quienHabla === 'guante' ? 'oyente' : null;
  useEffect(() => {
    if (mirarA && baseLista) enviarBase(`G:${ANGULO_BASE[mirarA]}`).catch(() => {});
  }, [mirarA, baseLista, enviarBase]);

  const sinGuante = fase !== 'operativo';
  const ocupado =
    fase === 'verificando' ||
    fase === 'escaneando' ||
    fase === 'conectando' ||
    fase === 'conectado' ||
    fase === 'reconectando';

  // --- Demo (solo web): simula guante y voz para ver la interfaz sin hardware ---
  const esDemo = Platform.OS === 'web';
  const demoRef = useRef(0);

  useEffect(
    () => () => {
      demoRef.current = -1; // corta cualquier demo en curso al salir
    },
    [],
  );

  const esperar = (ms: number) =>
    new Promise<void>((resolver) => {
      setTimeout(resolver, ms);
    });

  const firmar = async (contenido: string, token: number) => {
    for (const caracter of contenido) {
      if (demoRef.current !== token) return;
      inyectarLinea(caracter === ' ' ? 'S:ESPACIO' : `S:${caracter}|96`);
      await esperar(240);
    }
    inyectarLinea('S:ESPACIO');
  };

  const decirVoz = (frase: string) => {
    cerrarGuanteRef.current();
    agregarVozRef.current(frase);
  };

  const correrDemo = async () => {
    demoRef.current += 1;
    const token = demoRef.current;
    const activa = () => demoRef.current === token;

    inyectarLinea('HELLO:SIM');
    await firmar('HOLA', token);
    await esperar(3800);
    if (!activa()) return;
    decirVoz('Hola, ¿cómo estás?');
    await esperar(2200);
    if (!activa()) return;
    await firmar('ESTOY BIEN', token);
    await esperar(3800);
    if (!activa()) return;
    decirVoz('Qué bueno. ¿Quieres un café?');
  };

  const insets = useSafeAreaInsets();

  return (
    <View style={styles.raiz}>
      <Fondo activo={vivoFuente} />

      <View
        style={[
          styles.marco,
          {
            paddingTop: Math.max(insets.top, 10),
            paddingBottom: Math.max(insets.bottom, 10),
            paddingLeft: Math.max(insets.left, 14),
            paddingRight: Math.max(insets.right, 14),
          },
        ]}
      >
        <View style={styles.escena}>
          {/* Barra superior compacta */}
          <View style={styles.barra}>
            <View style={styles.barraLado}>
              <Pressable
                onPress={salir}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Volver"
              >
                <Cristal style={styles.botonRedondo}>
                  <Icono nombre="atras" tamano={18} />
                </Cristal>
              </Pressable>
              <Cristal style={styles.chip}>
                <View style={[styles.punto, { backgroundColor: COLORES_FASE[fase] }]} />
                <Text style={styles.chipTexto} numberOfLines={1}>
                  {ETIQUETAS_CORTAS[fase]}
                </Text>
                {simulado ? <Text style={styles.simulado}>simulado</Text> : null}
              </Cristal>
              {baseLista ? (
                <Cristal style={styles.chip}>
                  <View style={[styles.punto, { backgroundColor: COLOR.verde }]} />
                  <Text style={styles.chipTexto} numberOfLines={1}>
                    {mirarA === 'sordo'
                      ? 'Base → persona sorda'
                      : mirarA === 'oyente'
                        ? 'Base → oyente'
                        : 'Base lista'}
                  </Text>
                </Cristal>
              ) : null}
            </View>

            <IndicadorTurno fuente={quienHabla} vivo={vivoFuente !== null} />

            <View style={[styles.barraLado, styles.barraDerecha]}>
              <Pressable
                onPress={() => setSenales((valor) => !valor)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Ver señales del guante"
                accessibilityState={{ expanded: senales }}
              >
                <Cristal
                  tinte={senales ? COLOR.guanteBorde : undefined}
                  style={styles.botonRedondo}
                >
                  <Icono nombre="senales" tamano={18} color={senales ? COLOR.guante : COLOR.texto} />
                </Cristal>
              </Pressable>
            </View>
          </View>

          {sinGuante || errorVoz ? (
            <View style={styles.avisos}>
              {sinGuante ? (
                <Cristal style={styles.aviso}>
                  <View style={[styles.punto, { backgroundColor: COLORES_FASE[fase] }]} />
                  <Text style={styles.avisoTexto} numberOfLines={1}>
                    {ocupado ? ETIQUETAS_FASE[fase] : 'Guantes sin conexión.'}
                  </Text>
                  {!ocupado ? (
                    <Pressable
                      onPress={conectar}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Conectar los guantes"
                      style={styles.avisoAccion}
                    >
                      <Text style={styles.avisoAccionTexto}>Conectar</Text>
                    </Pressable>
                  ) : null}
                </Cristal>
              ) : null}
              {errorVoz ? (
                <Cristal tinte={'rgba(255,93,93,0.4)'} style={styles.aviso}>
                  <Text style={[styles.avisoTexto, { color: COLOR.coral }]} numberOfLines={1}>
                    {errorVoz}
                  </Text>
                </Cristal>
              ) : null}
            </View>
          ) : null}

          {esDemo ? (
            <View style={styles.demoFila}>
              <Text style={styles.demoTitulo}>Demo web:</Text>
              <Pressable onPress={() => void correrDemo()} style={styles.demoBoton}>
                <Text style={styles.demoTexto}>Conversación de ejemplo</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  demoRef.current += 1;
                  void firmar('BUENOS DIAS', demoRef.current);
                }}
                style={styles.demoBoton}
              >
                <Text style={styles.demoTexto}>Firmar</Text>
              </Pressable>
              <Pressable
                onPress={() => decirVoz('Buenos días, ¿en qué te ayudo?')}
                style={styles.demoBoton}
              >
                <Text style={styles.demoTexto}>Hablar</Text>
              </Pressable>
            </View>
          ) : null}

          {/* La pantalla grande: el texto del turno actual */}
          <View style={styles.grande}>
            <PantallaGrande actual={actual} previo={previo} />

            {senales ? (
              <Animated.View
                entering={FadeIn.duration(180)}
                exiting={FadeOut.duration(140)}
                style={styles.senales}
              >
                <Cristal fuerte style={styles.senalesCara}>
                  <Text style={styles.senalesTitulo}>Señales del guante</Text>
                  {tele ? (
                    <Text style={styles.senalesLinea}>
                      Flexión {tele.flex.map((valor) => valor.toFixed(0)).join(' · ')}%  ·  giro{' '}
                      {tele.roll.toFixed(0)}° / {tele.pitch.toFixed(0)}°
                    </Text>
                  ) : (
                    <Text style={styles.senalesLinea}>Sin telemetría todavía</Text>
                  )}
                  <Text style={styles.senalesLinea}>
                    {totalFrames} lecturas · {framesInvalidos} inválidas
                    {confianza !== null ? ` · confianza ${confianza}%` : ''}
                  </Text>
                  {debugFrames.slice(0, 3).map((cuadro) => (
                    <Text key={cuadro.id} style={styles.senalesTenue}>
                      {cuadro.texto}
                      {cuadro.confianza !== null ? ` · ${cuadro.confianza}%` : ''}
                    </Text>
                  ))}
                  <Pressable
                    onPress={() => router.push('/session')}
                    accessibilityRole="button"
                    accessibilityLabel="Editar el texto con sugerencias de frases"
                    style={styles.senalesAccion}
                  >
                    <Text style={styles.senalesAccionTexto}>Editar con sugerencias</Text>
                  </Pressable>
                </Cristal>
              </Animated.View>
            ) : null}
          </View>
        </View>

        {/* Riel de controles, angosto para dejarle la pantalla al texto */}
        <View style={styles.riel}>
          <BotonControl
            icono={escuchando ? 'parar' : 'mic'}
            etiqueta={escuchando ? 'Oyendo' : 'Mic'}
            descripcion={escuchando ? 'Pausar el micrófono' : 'Escuchar al oyente'}
            tono="voz"
            encendido={escuchando}
            alPresionar={alternarMic}
          />
          <BotonControl
            icono="voz"
            etiqueta={autoVoz ? 'Leer: sí' : 'Leer: no'}
            descripcion={
              autoVoz
                ? 'Leer las señas en voz alta automáticamente: activado'
                : 'Leer las señas en voz alta automáticamente: desactivado'
            }
            tono="guante"
            encendido={autoVoz}
            alPresionar={() => setAutoVoz((valor) => !valor)}
          />
          <BotonControl icono="borrar" etiqueta="Borrar" alPresionar={borrarTodo} />
          <BotonControl icono="apagar" etiqueta="Terminar" tono="coral" alPresionar={terminar} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
    backgroundColor: COLOR.abismo,
  },
  marco: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  escena: {
    flex: 1,
    gap: 8,
  },
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  barraLado: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  barraDerecha: {
    justifyContent: 'flex-end',
  },
  botonRedondo: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 19,
    flexShrink: 1,
  },
  punto: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chipTexto: {
    fontFamily: FUENTE.normal,
    fontSize: 12,
    color: COLOR.texto,
    flexShrink: 1,
  },
  simulado: {
    fontFamily: FUENTE.negrita,
    fontSize: 11,
    color: COLOR.voz,
  },
  avisos: {
    flexDirection: 'row',
    gap: 8,
  },
  aviso: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  avisoTexto: {
    flex: 1,
    fontFamily: FUENTE.normal,
    fontSize: 12,
    color: COLOR.suave,
  },
  avisoAccion: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: COLOR.guanteSuave,
    borderWidth: 1,
    borderColor: COLOR.guanteBorde,
  },
  avisoAccionTexto: {
    fontFamily: FUENTE.negrita,
    fontSize: 12,
    color: COLOR.guante,
  },
  demoFila: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  demoTitulo: {
    fontFamily: FUENTE.negrita,
    fontSize: 11,
    color: COLOR.tenue,
  },
  demoBoton: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLOR.borde,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  demoTexto: {
    fontFamily: FUENTE.negrita,
    fontSize: 11,
    color: COLOR.texto,
  },
  grande: {
    flex: 1,
  },
  senales: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  senalesCara: {
    padding: 14,
    gap: 4,
  },
  senalesTitulo: {
    fontFamily: FUENTE.negrita,
    fontSize: 14,
    color: COLOR.guante,
    marginBottom: 2,
  },
  senalesLinea: {
    fontFamily: FUENTE.normal,
    fontSize: 12,
    color: COLOR.texto,
  },
  senalesTenue: {
    fontFamily: FUENTE.normal,
    fontSize: 12,
    color: COLOR.tenue,
  },
  senalesAccion: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLOR.borde,
  },
  senalesAccionTexto: {
    fontFamily: FUENTE.negrita,
    fontSize: 12,
    color: COLOR.suave,
  },
  riel: {
    width: ANCHO_RIEL,
    gap: 8,
  },
});
