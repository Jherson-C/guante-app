/**
 * Pantalla de conexión. Un único camino claro: conectar el guante y entrar a la
 * conversación. La órbita de la izquierda (o de arriba, en vertical) respira
 * mientras busca el guante y se queda quieta cuando está listo.
 */

import { useEffect } from 'react';
import { router } from 'expo-router';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimadoPressable, useRebote } from '@/components/controles';
import { Cristal } from '@/components/cristal';
import { Fondo } from '@/components/fondo';
import { Icono } from '@/components/icono';
import { NOMBRES_DISPOSITIVO } from '@/ble/protocol';
import type { IdDispositivo } from '@/ble/protocol';
import { COLORES_FASE, ETIQUETAS_CORTAS, ETIQUETAS_FASE } from '@/constants/guante-fases';
import { COLOR, FUENTE } from '@/constants/tema';
import { useGuante } from '@/hooks/use-guante';

function Orbita({ tamano, buscando, listo }: { tamano: number; buscando: boolean; listo: boolean }) {
  const reducir = useReducedMotion();
  const latido = useSharedValue(0);
  const giro = useSharedValue(0);

  useEffect(() => {
    if (reducir) return;
    giro.value = withRepeat(withTiming(360, { duration: 40000, easing: Easing.linear }), -1);
    return () => cancelAnimation(giro);
  }, [reducir, giro]);

  useEffect(() => {
    if (buscando && !reducir) {
      latido.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
      );
    } else {
      cancelAnimation(latido);
      latido.value = withTiming(0, { duration: 300 });
    }
    return () => cancelAnimation(latido);
  }, [buscando, reducir, latido]);

  const anilloExterior = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + latido.value * 0.04 }],
    opacity: 0.55 + latido.value * 0.45,
  }));
  const anilloMedio = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + latido.value * 0.07 }],
    opacity: 0.7 + latido.value * 0.3,
  }));
  const anilloGiratorio = useAnimatedStyle(() => ({
    transform: [{ rotate: `${giro.value}deg` }],
  }));

  const color = listo ? COLOR.verde : COLOR.guante;
  const nucleo = Math.round(tamano * 0.34);

  return (
    <View style={{ width: tamano, height: tamano }} accessible={false}>
      <Animated.View
        style={[
          styles.anillo,
          { borderColor: `${color}33`, borderRadius: tamano / 2 },
          anilloExterior,
        ]}
      />
      <Animated.View
        style={[
          styles.anillo,
          {
            margin: tamano * 0.12,
            borderColor: `${color}55`,
            borderRadius: tamano / 2,
          },
          anilloMedio,
        ]}
      />
      <Animated.View
        style={[
          styles.anillo,
          {
            margin: tamano * 0.24,
            borderColor: `${color}66`,
            borderStyle: 'dashed',
            borderRadius: tamano / 2,
          },
          anilloGiratorio,
        ]}
      />
      <View style={styles.centro}>
        <Cristal
          fuerte
          tinte={`${color}66`}
          style={[styles.nucleo, { width: nucleo, height: nucleo, borderRadius: nucleo * 0.3 }]}
        >
          <Icono nombre="mano" tamano={Math.round(nucleo * 0.5)} color={color} grosor={1.8} />
        </Cristal>
      </View>
    </View>
  );
}

function BotonPrimario({
  etiqueta,
  alPresionar,
  deshabilitado,
  descripcion,
  compacto,
}: {
  etiqueta: string;
  alPresionar: () => void;
  deshabilitado?: boolean;
  descripcion: string;
  compacto: boolean;
}) {
  const rebote = useRebote();
  return (
    <AnimadoPressable
      onPress={alPresionar}
      onPressIn={rebote.alPresionar}
      onPressOut={rebote.alSoltar}
      disabled={deshabilitado}
      accessibilityRole="button"
      accessibilityLabel={descripcion}
      accessibilityState={{ disabled: deshabilitado }}
      style={[styles.primario, compacto && styles.primarioCompacto, deshabilitado && styles.primarioApagado, rebote.estilo]}
    >
      <Text style={styles.primarioTexto}>{etiqueta}</Text>
    </AnimadoPressable>
  );
}

const OCUPADO = ['verificando', 'escaneando', 'conectando', 'conectado', 'reconectando'];

/** Estado y acción del cerebro (guantes + base). */
function ListaDispositivos({ compacto }: { compacto: boolean }) {
  const { dispositivos, conectarDispositivo, desconectarDispositivo, enviarBase } = useGuante();
  return (
    <View style={styles.dispositivos}>
      {(Object.keys(dispositivos) as IdDispositivo[]).map((id) => {
        const { fase } = dispositivos[id];
        const nombre = NOMBRES_DISPOSITIVO[id];
        const enUso = fase === 'operativo' || OCUPADO.includes(fase);
        const estadoTexto = fase === 'operativo' ? 'Listo' : ETIQUETAS_CORTAS[fase];
        return (
          <Cristal key={id} style={[styles.dispositivo, compacto && styles.dispositivoCompacto]}>
            <View
              style={[styles.punto, { backgroundColor: COLORES_FASE[fase] }]}
              accessible
              accessibilityLabel={`${nombre}: ${estadoTexto}`}
            />
            <Text style={styles.dispositivoNombre}>{nombre}</Text>
            <Text style={styles.dispositivoEstado}>{estadoTexto}</Text>
            <Pressable
              onPress={() => (enUso ? desconectarDispositivo(id) : conectarDispositivo(id))}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`${enUso ? 'Desconectar' : 'Conectar'} ${nombre.toLowerCase()}`}
            >
              <Text style={[styles.secundarioTexto, enUso && { color: COLOR.coral }]}>
                {enUso ? 'Desconectar' : 'Conectar'}
              </Text>
            </Pressable>
          </Cristal>
        );
      })}
      {dispositivos.guantes.fase === 'operativo' ? (
        // Prueba manual de la base (servo en el cerebro): G:<grados>, ver src/ble/protocol.ts.
        <View style={styles.secundarias}>
          {([['Izquierda', 0], ['Centro', 90], ['Derecha', 180]] as const).map(([etiqueta, grados]) => (
            <Pressable
              key={grados}
              onPress={() => enviarBase(`G:${grados}`).catch(() => {})}
              style={styles.secundario}
              accessibilityRole="button"
              accessibilityLabel={`Girar la base a ${grados} grados`}
            >
              <Text style={styles.secundarioTexto}>{etiqueta}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function Conexion() {
  const { fase, detalle, activo, simulado, conectar, desconectar } = useGuante();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const horizontal = width > height;
  // Celular acostado: poca altura, así que todo se achica para entrar sin desplazar.
  const compacto = horizontal && height < 450;
  const esAndroid = Platform.OS === 'android';

  const buscando =
    fase === 'verificando' ||
    fase === 'escaneando' ||
    fase === 'conectando' ||
    fase === 'conectado' ||
    fase === 'reconectando';

  const tamanoOrbita = horizontal
    ? Math.round(Math.min(height * 0.7, width * 0.36))
    : Math.round(Math.min(width * 0.7, 300));

  const etiquetaConectar =
    fase === 'inicial' || fase === 'desconectado' || fase === 'no-encontrado'
      ? 'Conectar dispositivos'
      : 'Reintentar';

  return (
    <View style={styles.raiz}>
      <Fondo activo={activo ? 'guante' : null} />

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: Math.max(insets.top, 16),
            paddingBottom: Math.max(insets.bottom, 16),
            paddingLeft: Math.max(insets.left, 24),
            paddingRight: Math.max(insets.right, 24),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.contenido, horizontal && styles.contenidoHorizontal]}>
          <View style={styles.orbitaZona}>
            <Orbita tamano={tamanoOrbita} buscando={buscando} listo={activo} />
            <Cristal style={styles.estado}>
              <View
                style={[styles.punto, { backgroundColor: COLORES_FASE[fase] }]}
                accessible
                accessibilityLabel={`Estado de conexión: ${ETIQUETAS_FASE[fase]}`}
              />
              <Text style={styles.estadoTexto}>{ETIQUETAS_FASE[fase]}</Text>
            </Cristal>
          </View>

          <View style={[styles.texto, horizontal && styles.textoHorizontal, compacto && styles.textoCompacto]}>
            <Text style={[styles.titulo, { fontSize: compacto ? 26 : horizontal ? 32 : 38 }]}>
              {activo ? 'Placa lista' : 'Conecta la placa'}
            </Text>
            <Text style={[styles.bajada, compacto && styles.bajadaCompacta]}>
              {activo
                ? 'Ya puedes conversar: lo que firmes y lo que diga la otra persona aparecerán juntos en una sola pantalla.'
                : 'Enciende la placa y mantenla a menos de un metro del teléfono. La cámara va en la laptop conectada a la placa.'}
            </Text>
            {!activo && esAndroid && !horizontal ? (
              <Text style={styles.ayuda}>
                Sentirás una vibración cuando se conecte y con cada letra.
              </Text>
            ) : null}
            {detalle ? <Text style={styles.detalle}>{detalle}</Text> : null}
            {simulado ? (
              <Text style={styles.simulado}>Firmware de demostración: datos simulados</Text>
            ) : null}
            {esAndroid ? <ListaDispositivos compacto={compacto} /> : null}

            <View style={[styles.acciones, compacto && styles.accionesCompactas]}>
              {!esAndroid ? (
                <BotonPrimario
                  compacto={compacto}
                  etiqueta="Ver conversación (demo)"
                  descripcion="Ver la pantalla de conversación con datos de demostración"
                  alPresionar={() => router.push('/conversacion')}
                />
              ) : activo ? (
                <BotonPrimario
                  compacto={compacto}
                  etiqueta="Iniciar conversación"
                  descripcion="Abrir la conversación de dos vías"
                  alPresionar={() => router.push('/conversacion')}
                />
              ) : (
                <BotonPrimario
                  compacto={compacto}
                  etiqueta={etiquetaConectar}
                  descripcion="Conectar la placa y la base giratoria por Bluetooth"
                  deshabilitado={buscando}
                  alPresionar={conectar}
                />
              )}

              <View style={styles.secundarias}>
                {esAndroid && !activo ? (
                  <Pressable
                    onPress={() => router.push('/conversacion')}
                    style={styles.secundario}
                    accessibilityRole="button"
                    accessibilityLabel="Conversar usando solo la voz, sin señas"
                  >
                    <Text style={styles.secundarioTexto}>Solo voz</Text>
                  </Pressable>
                ) : null}
                {esAndroid && fase !== 'inicial' && fase !== 'ble-no-disponible' ? (
                  <Pressable
                    onPress={desconectar}
                    style={styles.secundario}
                    accessibilityRole="button"
                    accessibilityLabel="Desconectar todos los dispositivos"
                  >
                    <Text style={[styles.secundarioTexto, { color: COLOR.coral }]}>
                      Desconectar todo
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            {!esAndroid ? (
              <Text style={styles.ayuda}>
                En el navegador no hay Bluetooth. Para conectar los guantes usa el APK en Android.
              </Text>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
    backgroundColor: COLOR.abismo,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: 18,
  },
  contenido: {
    alignItems: 'center',
    gap: 28,
  },
  contenidoHorizontal: {
    flexDirection: 'row',
    gap: 48,
  },
  orbitaZona: {
    alignItems: 'center',
    gap: 14,
    flexShrink: 0,
  },
  anillo: {
    ...StyleSheet.absoluteFill,
    borderWidth: 1.5,
  },
  centro: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nucleo: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  estado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
  punto: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  estadoTexto: {
    fontFamily: FUENTE.normal,
    fontSize: 13,
    color: COLOR.texto,
  },
  texto: {
    gap: 12,
    alignItems: 'center',
    maxWidth: 520,
  },
  textoHorizontal: {
    flex: 1,
    alignItems: 'flex-start',
  },
  textoCompacto: {
    gap: 8,
  },
  titulo: {
    fontFamily: FUENTE.display,
    color: COLOR.texto,
    letterSpacing: -1.2,
  },
  bajada: {
    fontFamily: FUENTE.normal,
    fontSize: 17,
    lineHeight: 26,
    color: COLOR.texto,
  },
  bajadaCompacta: {
    fontSize: 14,
    lineHeight: 20,
  },
  ayuda: {
    fontFamily: FUENTE.normal,
    fontSize: 14,
    lineHeight: 21,
    color: COLOR.suave,
  },
  detalle: {
    fontFamily: FUENTE.normal,
    fontSize: 13,
    lineHeight: 19,
    color: COLOR.voz,
  },
  simulado: {
    fontFamily: FUENTE.negrita,
    fontSize: 12,
    color: COLOR.voz,
  },
  acciones: {
    alignSelf: 'stretch',
    gap: 10,
    marginTop: 10,
  },
  primario: {
    backgroundColor: COLOR.guante,
    borderRadius: 18,
    paddingVertical: 19,
    alignItems: 'center',
    shadowColor: COLOR.guante,
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  primarioCompacto: {
    paddingVertical: 12,
  },
  primarioApagado: {
    opacity: 0.45,
  },
  primarioTexto: {
    fontFamily: FUENTE.display,
    fontSize: 19,
    color: '#04222A',
    letterSpacing: -0.2,
  },
  dispositivos: {
    alignSelf: 'stretch',
    gap: 8,
  },
  dispositivo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
  },
  dispositivoCompacto: {
    paddingVertical: 8,
  },
  dispositivoNombre: {
    flex: 1,
    fontFamily: FUENTE.negrita,
    fontSize: 15,
    color: COLOR.texto,
  },
  dispositivoEstado: {
    fontFamily: FUENTE.normal,
    fontSize: 13,
    color: COLOR.suave,
  },
  accionesCompactas: {
    gap: 6,
    marginTop: 4,
  },
  secundarias: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  secundario: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLOR.borde,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  secundarioTexto: {
    fontFamily: FUENTE.negrita,
    fontSize: 14,
    color: COLOR.suave,
  },
});
