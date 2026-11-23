/**
 * Conversación de dos vías en UNA sola pantalla.
 *
 * Lo que firma el guante (cian, a la izquierda) y lo que dice la voz (ámbar, a
 * la derecha) se intercalan en un mismo hilo, en el orden en que ocurren. El
 * turno en curso es grande; los anteriores se achican y se apagan. En
 * horizontal los controles van en un riel a la derecha; en vertical, abajo.
 *
 * La voz alta es solo del lado del guante (el oyente escucha lo firmado). El
 * micrófono transcribe al oyente para que lo lea la persona sorda.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { router } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BotonControl, BotonMic } from '@/components/controles';
import { Cristal } from '@/components/cristal';
import { Fondo } from '@/components/fondo';
import { Icono } from '@/components/icono';
import { IndicadorTurno } from '@/components/indicador-turno';
import { TarjetaTurno } from '@/components/tarjeta-turno';
import { COLORES_FASE, ETIQUETAS_CORTAS, ETIQUETAS_FASE } from '@/constants/guante-fases';
import { COLOR, FUENTE } from '@/constants/tema';
import type { Fuente } from '@/constants/tema';
import { useGuante } from '@/hooks/use-guante';
import { useReconocimientoVoz } from '@/hooks/use-reconocimiento-voz';
import { useTextoAVoz } from '@/hooks/use-texto-a-voz';
import { useTurnos } from '@/hooks/use-turnos';

const ANCHO_RIEL = 136;

function salir() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export default function Conversacion() {
  useKeepAwake();

  const {
    texto,
    fase,
    confianza,
    simulado,
    tele,
    totalFrames,
    framesInvalidos,
    debugFrames,
    conectar,
    desconectar,
    limpiarTexto,
    inyectarLinea,
  } = useGuante();

  const { hablar, detener: detenerVoz, hablando } = useTextoAVoz();
  const [autoVoz, setAutoVoz] = useState(false);
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

  // --- Diseño responsivo -------------------------------------------------
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const horizontal = width > height;
  const anchoEscena = horizontal ? width - ANCHO_RIEL - insets.left - insets.right : width;
  const anchoMax = Math.round(anchoEscena * (horizontal ? 0.78 : 0.92));
  const tamanoVivo = horizontal
    ? Math.min(54, Math.max(30, Math.round(anchoEscena * 0.055)))
    : Math.min(46, Math.max(28, Math.round(width * 0.1)));

  // --- Quién tiene la palabra -------------------------------------------
  const vivoFuente: Fuente | null = parcial ? 'voz' : guanteVivo ? 'guante' : null;
  const ultimaFuente = turnos.length > 0 ? turnos[turnos.length - 1].fuente : null;
  const hayVivo = Boolean(guanteVivo) || Boolean(parcial);
  const vacio = turnos.length === 0 && !hayVivo;

  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);

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
    await esperar(2200);
    if (!activa()) return;
    inyectarLinea('S:GRACIAS|97');
  };

  const botonMic = <BotonMic escuchando={escuchando} alPresionar={alternarMic} />;
  const botonLeer = (
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
  );
  const botonBorrar = <BotonControl icono="borrar" etiqueta="Borrar" alPresionar={borrarTodo} />;
  const botonTerminar = (
    <BotonControl icono="apagar" etiqueta="Terminar" tono="coral" alPresionar={terminar} />
  );

  const controles = horizontal ? (
    <View style={styles.riel}>
      <View style={styles.rielMic}>{botonMic}</View>
      <View style={styles.rielFila}>
        {botonLeer}
        {botonBorrar}
      </View>
      <View style={styles.rielTerminar}>{botonTerminar}</View>
    </View>
  ) : (
    <View style={styles.muelle}>
      {botonMic}
      {botonLeer}
      {botonBorrar}
      {botonTerminar}
    </View>
  );

  return (
    <View style={styles.raiz}>
      <Fondo activo={vivoFuente} />

      <View
        style={[
          styles.marco,
          {
            paddingTop: Math.max(insets.top, 12),
            paddingBottom: Math.max(insets.bottom, 12),
            paddingLeft: Math.max(insets.left, 14),
            paddingRight: Math.max(insets.right, 14),
          },
        ]}
      >
        {/* Barra superior */}
        <View style={styles.barra}>
          <View style={styles.barraLado}>
            <Pressable
              onPress={salir}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Volver"
            >
              <Cristal style={styles.botonRedondo}>
                <Icono nombre="atras" tamano={20} />
              </Cristal>
            </Pressable>
            <Cristal style={styles.chip}>
              <View style={[styles.punto, { backgroundColor: COLORES_FASE[fase] }]} />
              <Text style={styles.chipTexto} numberOfLines={1}>
                {ETIQUETAS_CORTAS[fase]}
              </Text>
              {simulado ? <Text style={styles.simulado}>simulado</Text> : null}
            </Cristal>
          </View>

          {horizontal ? <IndicadorTurno fuente={vivoFuente ?? ultimaFuente} vivo={vivoFuente !== null} /> : null}

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
                <Icono nombre="senales" tamano={20} color={senales ? COLOR.guante : COLOR.texto} />
              </Cristal>
            </Pressable>
          </View>
        </View>

        {!horizontal ? (
          <View style={styles.indicadorVertical}>
            <IndicadorTurno fuente={vivoFuente ?? ultimaFuente} vivo={vivoFuente !== null} />
          </View>
        ) : null}

        {/* Cuerpo: escena + controles */}
        <View style={[styles.cuerpo, horizontal && styles.cuerpoHorizontal]}>
          <View style={styles.escena}>
            {sinGuante || errorVoz ? (
              <View style={styles.avisos}>
                {sinGuante ? (
                  <Cristal style={styles.aviso}>
                    <View style={[styles.punto, { backgroundColor: COLORES_FASE[fase] }]} />
                    <Text style={styles.avisoTexto} numberOfLines={2}>
                      {ocupado
                        ? ETIQUETAS_FASE[fase]
                        : 'Guante sin conexión. Puedes seguir usando la voz.'}
                    </Text>
                    {!ocupado ? (
                      <Pressable
                        onPress={conectar}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Conectar el guante"
                        style={styles.avisoAccion}
                      >
                        <Text style={styles.avisoAccionTexto}>Conectar</Text>
                      </Pressable>
                    ) : null}
                  </Cristal>
                ) : null}
                {errorVoz ? (
                  <Cristal tinte={'rgba(255,93,93,0.4)'} style={styles.aviso}>
                    <Text style={[styles.avisoTexto, { color: COLOR.coral }]} numberOfLines={2}>
                      {errorVoz}
                    </Text>
                  </Cristal>
                ) : null}
              </View>
            ) : null}

            {esDemo ? (
              <Cristal style={styles.demo}>
                <Text style={styles.demoTitulo}>Demo sin guante (solo web)</Text>
                <View style={styles.demoFila}>
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
                    <Text style={styles.demoTexto}>Firmar «BUENOS DIAS»</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => decirVoz('Buenos días, ¿en qué te ayudo?')}
                    style={styles.demoBoton}
                  >
                    <Text style={styles.demoTexto}>Voz de ejemplo</Text>
                  </Pressable>
                </View>
              </Cristal>
            ) : null}

            <ScrollView
              ref={scrollRef}
              style={styles.scroll}
              contentContainerStyle={styles.hilo}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            >
              {vacio ? (
                <Animated.View entering={FadeIn.duration(500)} style={styles.vacio}>
                  <View style={styles.vacioIconos}>
                    <Icono nombre="mano" tamano={26} color={COLOR.guante} />
                    <View style={styles.vacioLinea} />
                    <Icono nombre="mic" tamano={26} color={COLOR.voz} />
                  </View>
                  <Text style={styles.vacioTitulo}>La conversación aparece aquí</Text>
                  <Text style={styles.vacioTexto}>
                    Haz señas con el guante o toca el micrófono. Cada uno se muestra en su
                    lado, en el orden en que ocurre.
                  </Text>
                </Animated.View>
              ) : null}

              {turnos.map((turno, indice) => {
                const distancia = turnos.length - 1 - indice + (hayVivo ? 1 : 0);
                return (
                  <TarjetaTurno
                    key={turno.id}
                    fuente={turno.fuente}
                    texto={turno.texto}
                    hora={turno.hora}
                    opacidad={Math.max(0.3, 1 - distancia * 0.2)}
                    tamano={tamanoVivo}
                    anchoMax={anchoMax}
                    alHablar={turno.fuente === 'guante' ? () => hablar(turno.texto) : undefined}
                  />
                );
              })}

              {guanteVivo ? (
                <TarjetaTurno
                  key="vivo-guante"
                  fuente="guante"
                  texto={guanteVivo}
                  vivo
                  tamano={tamanoVivo}
                  anchoMax={anchoMax}
                />
              ) : null}
              {parcial ? (
                <TarjetaTurno
                  key="vivo-voz"
                  fuente="voz"
                  texto={parcial}
                  vivo
                  tamano={tamanoVivo}
                  anchoMax={anchoMax}
                />
              ) : null}
            </ScrollView>

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

            <Text style={styles.pie}>
              El texto vive solo en la memoria del teléfono. El audio lo procesa el reconocedor de
              Android; la app no lo guarda.
            </Text>
          </View>

          {controles}
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
    gap: 10,
  },
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  barraLado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
    minWidth: 150,
  },
  barraDerecha: {
    justifyContent: 'flex-end',
  },
  botonRedondo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    flexShrink: 1,
  },
  punto: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chipTexto: {
    fontFamily: FUENTE.normal,
    fontSize: 13,
    color: COLOR.texto,
    flexShrink: 1,
  },
  simulado: {
    fontFamily: FUENTE.negrita,
    fontSize: 11,
    color: COLOR.voz,
  },
  indicadorVertical: {
    alignItems: 'center',
  },
  cuerpo: {
    flex: 1,
    gap: 10,
  },
  cuerpoHorizontal: {
    flexDirection: 'row',
    gap: 14,
  },
  escena: {
    flex: 1,
  },
  avisos: {
    gap: 8,
    marginBottom: 8,
  },
  aviso: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  avisoTexto: {
    flex: 1,
    fontFamily: FUENTE.normal,
    fontSize: 13,
    color: COLOR.suave,
  },
  avisoAccion: {
    paddingVertical: 6,
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
  scroll: {
    flex: 1,
  },
  hilo: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    gap: 10,
    paddingVertical: 8,
  },
  vacio: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  vacioIconos: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  vacioLinea: {
    width: 44,
    height: 1,
    backgroundColor: COLOR.borde,
  },
  vacioTitulo: {
    fontFamily: FUENTE.display,
    fontSize: 24,
    color: COLOR.texto,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  vacioTexto: {
    fontFamily: FUENTE.normal,
    fontSize: 14,
    lineHeight: 21,
    color: COLOR.suave,
    textAlign: 'center',
    maxWidth: 360,
  },
  demo: {
    padding: 12,
    gap: 8,
    marginBottom: 8,
    borderRadius: 16,
  },
  demoTitulo: {
    fontFamily: FUENTE.negrita,
    fontSize: 12,
    color: COLOR.suave,
  },
  demoFila: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  demoBoton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLOR.borde,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  demoTexto: {
    fontFamily: FUENTE.negrita,
    fontSize: 12,
    color: COLOR.texto,
  },
  senales: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 34,
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
  pie: {
    fontFamily: FUENTE.normal,
    fontSize: 10,
    lineHeight: 14,
    color: COLOR.tenue,
    textAlign: 'center',
    marginTop: 4,
  },
  riel: {
    width: ANCHO_RIEL,
    gap: 10,
  },
  rielMic: {
    flex: 1.8,
  },
  rielFila: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  rielTerminar: {
    flex: 0.75,
  },
  muelle: {
    flexDirection: 'row',
    height: 112,
    gap: 8,
  },
});
