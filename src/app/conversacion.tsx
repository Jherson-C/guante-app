/**
 * Modo conversación de dos vías, pensado para el teléfono en horizontal:
 *
 *   IZQUIERDA (sordo): lo que firma con el guante.
 *   DERECHA (oyente): lo que dice el oyente, transcrito por el micrófono.
 *
 * La voz alta es SOLO del lado del guante: el oyente escucha lo que firmó el
 * sordo. La respuesta del oyente solo se escribe para que la lea el sordo.
 *
 * Ambos textos son transitorios: si no llega nada nuevo en unos segundos, se
 * limpian solos para dejar la pantalla lista para el siguiente turno.
 */

import { useEffect } from 'react';
import { router } from 'expo-router';
import { activateKeepAwakeAsync } from 'expo-keep-awake';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { COLORES_FASE, ETIQUETAS_FASE } from '@/constants/guante-fases';
import { useGuante } from '@/hooks/use-guante';
import { useReconocimientoVoz } from '@/hooks/use-reconocimiento-voz';
import { useTextoAVoz } from '@/hooks/use-texto-a-voz';
import { useTextoTransitorio } from '@/hooks/use-texto-transitorio';

export default function Conversacion() {
  const {
    texto,
    fase,
    confianza,
    activo,
    simulado,
  } = useGuante();

  const { visible: visibleGuante, limpiar: limpiarGuante } = useTextoTransitorio(
    texto,
    9000,
  );

  const {
    escuchando,
    transcripcion,
    parcial,
    error: errorVoz,
    iniciar,
    detener,
    limpiar,
  } = useReconocimientoVoz();

  const { visible: visibleVoz, limpiar: limpiarVoz } = useTextoTransitorio(
    transcripcion,
    12000,
  );

  const { hablar, detener: detenerVoz, hablando } = useTextoAVoz();
  const { width, height } = useWindowDimensions();
  const horizontal = width > height;
  const tamanoTexto = horizontal
    ? Math.min(56, Math.max(28, Math.round(width * 0.065)))
    : Math.min(46, Math.max(24, Math.round(width * 0.1)));

  const textoGuante = visibleGuante || '…';
  const textoOyente = [visibleVoz, parcial].filter(Boolean).join(' ') || '…';

  useEffect(() => {
    void activateKeepAwakeAsync();
  }, []);

  if (!activo) {
    return (
      <View style={[styles.contenedor, styles.centrado]}>
        <Text style={styles.aviso}>El guante no está conectado.</Text>
        <Pressable
          style={styles.botonVolver}
          onPress={() => router.replace('/')}
          accessibilityRole="button"
          accessibilityLabel="Ir a la pantalla de conexión"
        >
          <Text style={styles.botonVolverTexto}>Ir a conectar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.contenedor}>
      <View style={styles.barra}>
        <View style={styles.estado}>
          <View style={[styles.punto, { backgroundColor: COLORES_FASE[fase] }]} />
          <Text style={styles.estadoTexto}>{ETIQUETAS_FASE[fase]}</Text>
        </View>
        <Text style={styles.titulo}>CONVERSACIÓN</Text>
        <View style={styles.barraDerecha}>
          {simulado ? <Text style={styles.simulado}>SIMULADO</Text> : null}
          <Pressable
            onPress={() => {
              detener();
              detenerVoz();
              router.back();
            }}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel="Salir del modo conversación"
          >
            <Text style={styles.cerrar}>×</Text>
          </Pressable>
        </View>
      </View>

      {!horizontal ? (
        <Text style={styles.girar}>Girá el teléfono para ver las dos columnas</Text>
      ) : null}

      <View
        style={[
          styles.cuerpo,
          horizontal ? styles.cuerpoHorizontal : styles.cuerpoVertical,
        ]}
      >
        <View style={[styles.panel, styles.panelGuante]}>
          <View style={styles.panelCabecera}>
            <Text style={styles.etiquetaGuante}>GUANTE · SORDO</Text>
            {confianza !== null ? (
              <Text style={styles.confianza}>{confianza}%</Text>
            ) : null}
          </View>

          <View style={styles.textoZona}>
            <Text
              style={[styles.texto, { fontSize: tamanoTexto }, styles.textoGuante]}
              numberOfLines={4}
              adjustsFontSizeToFit
              minimumFontScale={0.3}
              accessibilityLabel="Texto que firma la persona sorda"
            >
              {textoGuante}
            </Text>
          </View>

          <View style={styles.filaBotones}>
            <Pressable
              style={[
                styles.boton,
                styles.botonVozAlta,
                (!visibleGuante || hablando) && styles.botonApagado,
              ]}
              onPress={() => {
                if (hablando) detenerVoz();
                else hablar(visibleGuante);
              }}
              disabled={!visibleGuante && !hablando}
              accessibilityRole="button"
              accessibilityLabel={
                hablando ? 'Detener la voz alta' : 'Leer en voz alta al oyente'
              }
            >
              <Text style={styles.botonTexto}>
                {hablando ? '⏹ Detener voz' : '🔊 Decir en voz alta'}
              </Text>
            </Pressable>
            <Pressable
              style={styles.boton}
              onPress={limpiarGuante}
              accessibilityRole="button"
              accessibilityLabel="Ocultar el texto del guante"
            >
              <Text style={styles.botonTexto}>Ocultar</Text>
            </Pressable>
          </View>
          <Text style={styles.piePanel}>Se borra solo a los 9 s sin señas</Text>
        </View>

        <View style={[styles.panel, styles.panelVoz]}>
          <View style={styles.panelCabecera}>
            <Text style={styles.etiquetaVoz}>VOZ · OYENTE</Text>
            {escuchando ? <Text style={styles.escuchando}>● escuchando</Text> : null}
          </View>

          <View style={styles.textoZona}>
            <Text
              style={[styles.texto, { fontSize: tamanoTexto }, styles.textoVoz]}
              numberOfLines={4}
              adjustsFontSizeToFit
              minimumFontScale={0.3}
              accessibilityLabel="Texto que dice la persona oyente"
            >
              {textoOyente}
            </Text>
          </View>

          {errorVoz ? (
            <Text style={styles.error} numberOfLines={2}>
              {errorVoz}
            </Text>
          ) : null}

          <View style={styles.filaBotones}>
            <Pressable
              style={[
                styles.boton,
                styles.botonMicrofono,
                escuchando && styles.botonMicrofonoActivo,
              ]}
              onPress={() => {
                if (escuchando) detener();
                else void iniciar();
              }}
              accessibilityRole="button"
              accessibilityLabel={
                escuchando ? 'Detener el micrófono' : 'Escuchar al oyente'
              }
            >
              <Text style={styles.botonTexto}>
                {escuchando ? '⏹ Detener' : '🎤 Hablar'}
              </Text>
            </Pressable>
            <Pressable
              style={styles.boton}
              onPress={() => {
                detener();
                limpiar();
                limpiarVoz();
              }}
              accessibilityRole="button"
              accessibilityLabel="Borrar la respuesta del oyente"
            >
              <Text style={styles.botonTexto}>Borrar</Text>
            </Pressable>
          </View>
          <Text style={styles.piePanel}>Se borra solo a los 12 s sin respuesta</Text>
        </View>
      </View>

      <Text style={styles.nota}>
        Voz alta solo del lado del guante · el micrófono transcribe al oyente ·
        el audio no se guarda
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: '#000',
    paddingTop: 18,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  centrado: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minHeight: 28,
    paddingHorizontal: 4,
  },
  estado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  punto: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  estadoTexto: {
    color: '#8a8a8a',
    fontSize: 10,
    flexShrink: 1,
  },
  titulo: {
    color: '#e8e8e8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  barraDerecha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  simulado: {
    color: '#e0b34e',
    fontSize: 10,
    fontWeight: '700',
  },
  cerrar: {
    color: '#9a9a9a',
    fontSize: 28,
    lineHeight: 28,
  },
  girar: {
    color: '#6f6f6f',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 6,
  },
  cuerpo: {
    flex: 1,
    gap: 8,
    marginTop: 8,
  },
  cuerpoHorizontal: {
    flexDirection: 'row',
  },
  cuerpoVertical: {
    flexDirection: 'column',
  },
  panel: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: '#080808',
    padding: 10,
    gap: 6,
    overflow: 'hidden',
  },
  panelGuante: {
    borderColor: '#2f6b4f',
  },
  panelVoz: {
    borderColor: '#2f4f6b',
  },
  panelCabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  etiquetaGuante: {
    color: '#4caf7d',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  etiquetaVoz: {
    color: '#6aa9e0',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  confianza: {
    color: '#5f7f6f',
    fontSize: 10,
  },
  escuchando: {
    color: '#6aa9e0',
    fontSize: 10,
  },
  textoZona: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 4,
  },
  texto: {
    color: '#ffffff',
    fontWeight: '700',
    textAlign: 'center',
    flexShrink: 1,
  },
  textoGuante: {
    color: '#eafff4',
  },
  textoVoz: {
    color: '#eef7ff',
  },
  filaBotones: {
    flexDirection: 'row',
    gap: 8,
  },
  boton: {
    flex: 1,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#3b3b3b',
    backgroundColor: '#121212',
    paddingVertical: 10,
    alignItems: 'center',
  },
  botonVozAlta: {
    borderColor: '#3f6b52',
  },
  botonMicrofono: {
    borderColor: '#3f5f7a',
  },
  botonMicrofonoActivo: {
    backgroundColor: '#1f3346',
    borderColor: '#6aa9e0',
  },
  botonApagado: {
    opacity: 0.45,
  },
  botonTexto: {
    color: '#e0e0e0',
    fontSize: 12,
    fontWeight: '600',
  },
  piePanel: {
    color: '#5f5f5f',
    fontSize: 9,
    textAlign: 'center',
  },
  error: {
    color: '#e05a4e',
    fontSize: 10,
    textAlign: 'center',
  },
  nota: {
    color: '#4f4f4f',
    fontSize: 9,
    textAlign: 'center',
    marginTop: 6,
  },
  aviso: {
    color: '#ffffff',
    fontSize: 20,
    textAlign: 'center',
  },
  botonVolver: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 34,
  },
  botonVolverTexto: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
  },
});
