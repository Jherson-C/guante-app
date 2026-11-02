/**
 * Pantalla de transcripción — el texto concatenado tal como define el flujo
 * de datos del MVP (SPEC §3 → interpretarFrame en use-guante).
 * Alto contraste + tipografía grande para lectura del interlocutor en
 * conversación frente a frente. Wake-lock: la pantalla no se apaga en sesión.
 */

import { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { activateKeepAwakeAsync } from 'expo-keep-awake';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SugerenciasFrases } from '@/components/sugerencias-frases';
import { COLORES_FASE, ETIQUETAS_FASE } from '@/constants/guante-fases';
import { completarConFrase, sugerirFrases } from '@/domain/frases';
import type { Frase } from '@/domain/frases';
import { useGuante } from '@/hooks/use-guante';

export default function Transcripcion() {
  const {
    texto,
    fase,
    confianza,
    debugFrames,
    totalFrames,
    framesInvalidos,
    infoLineas,
    tele,
    simulado,
    limpiarTexto,
    agregarEspacio,
    borrarUltimo,
    reemplazarTexto,
    desconectar,
  } = useGuante();
  const [debugAbierto, setDebugAbierto] = useState(false);
  const sugerencias = useMemo(() => sugerirFrases(texto), [texto]);

  useEffect(() => {
    void activateKeepAwakeAsync();
  }, []);

  return (
    <View style={styles.contenedor}>
      <View style={styles.barra}>
        <Text style={[styles.fase, { color: COLORES_FASE[fase] }]}>
          {ETIQUETAS_FASE[fase]}
        </Text>
        <View style={styles.barraDerecha}>
          {confianza !== null ? (
            <Text style={styles.confianza}>conf. {confianza}%</Text>
          ) : null}
          <Pressable
            onPress={() => router.push('/conversacion')}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Abrir el modo conversación"
          >
            <Text style={styles.iconoPantalla}>⛶</Text>
          </Pressable>
        </View>
      </View>

      {simulado ? (
        <Text style={styles.avisoSimulado}>
          SIMULADO · firmware de demo, sin sensores
        </Text>
      ) : null}

      <View style={styles.textoZona}>
        <Text
          style={styles.texto}
          numberOfLines={4}
          adjustsFontSizeToFit
          minimumFontScale={0.35}
          accessibilityLabel="Texto transcrito del guante"
        >
          {texto || '…'}
        </Text>
      </View>

      <SugerenciasFrases
        sugerencias={sugerencias}
        onElegir={(frase: Frase) => reemplazarTexto(completarConFrase(texto, frase))}
      />

      <View style={styles.filaEdicion}>
        <Pressable
          style={styles.botonEdicion}
          onPress={agregarEspacio}
          accessibilityRole="button"
          accessibilityLabel="Agregar un espacio al texto"
        >
          <Text style={styles.botonEdicionTexto}>ESPACIO</Text>
        </Pressable>
        <Pressable
          style={styles.botonEdicion}
          onPress={borrarUltimo}
          accessibilityRole="button"
          accessibilityLabel="Borrar el último carácter"
        >
          <Text style={styles.botonEdicionTexto}>⌫ BORRAR</Text>
        </Pressable>
        <Pressable
          style={styles.botonEdicion}
          onPress={limpiarTexto}
          accessibilityRole="button"
          accessibilityLabel="Limpiar todo el texto transcrito"
        >
          <Text style={styles.botonEdicionTexto}>LIMPIAR</Text>
        </Pressable>
      </View>

      <Pressable
        style={styles.botonDebug}
        onPress={() => setDebugAbierto((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel="Mostrar panel de depuración"
      >
        <Text style={styles.botonDebugTexto}>
          {debugAbierto ? '▾ depuración' : '▸ depuración'}
        </Text>
      </Pressable>

      {debugAbierto ? (
        <View style={styles.panelDebug}>
          {tele ? (
            <Text style={styles.debugLinea}>
              flex {tele.flex.map((f) => f.toFixed(0)).join('/')} · r{tele.roll.toFixed(0)}
              ° p{tele.pitch.toFixed(0)}° g{tele.gyro.toFixed(0)}
            </Text>
          ) : null}
          <Text style={styles.debugTitulo}>
            reconocimientos · total {totalFrames} · inválidos {framesInvalidos}
          </Text>
          {debugFrames.map((f) => (
            <Text key={f.id} style={styles.debugLinea}>
              {f.texto}
              {f.confianza !== null ? ` · conf ${f.confianza}%` : ''}
            </Text>
          ))}
          {infoLineas.length > 0 ? (
            <Text style={styles.debugLinea} numberOfLines={1}>
              firmware: {infoLineas[0]}
            </Text>
          ) : null}
          <Text style={styles.debugNota}>
            Telemetría/estado viven solo en memoria — ni esto se persiste.
          </Text>
        </View>
      ) : null}

      <View style={styles.filaBotones}>
        <Pressable
          style={styles.botonSecundario}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Volver a la pantalla de conexión"
        >
          <Text style={styles.botonSecundarioTexto}>Volver</Text>
        </Pressable>
        <Pressable
          style={[styles.botonSecundario, styles.botonSalir]}
          onPress={desconectar}
          accessibilityRole="button"
          accessibilityLabel="Finalizar sesión y desconectar el guante"
        >
          <Text style={[styles.botonSecundarioTexto, { color: '#e05a4e' }]}>
            Terminar sesión
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: '#000',
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  barra: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 24,
  },
  fase: {
    fontSize: 14,
    fontWeight: '600',
  },
  confianza: {
    fontSize: 14,
    color: '#8a8a8a',
  },
  barraDerecha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconoPantalla: {
    color: '#8a8a8a',
    fontSize: 20,
  },
  avisoSimulado: {
    color: '#e0b34e',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  textoZona: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  texto: {
    color: '#ffffff',
    fontSize: 96,
    fontWeight: '700',
    textAlign: 'center',
    flexShrink: 1,
  },
  filaEdicion: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
  },
  botonEdicion: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#5a5a5a',
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  botonEdicionTexto: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  botonDebug: {
    alignSelf: 'center',
    paddingVertical: 4,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  botonDebugTexto: {
    color: '#6a6a6a',
    fontSize: 13,
  },
  panelDebug: {
    borderRadius: 8,
    backgroundColor: '#111',
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  debugTitulo: {
    color: '#6a6a6a',
    fontSize: 12,
    marginBottom: 4,
  },
  debugLinea: {
    color: '#cccccc',
    fontSize: 12,
  },
  debugNota: {
    color: '#545454',
    fontSize: 11,
    marginTop: 4,
  },
  filaBotones: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  botonSecundario: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#5a5a5a',
    paddingVertical: 12,
    alignItems: 'center',
  },
  botonSalir: {
    borderColor: '#7a3833',
  },
  botonSecundarioTexto: {
    color: '#dddddd',
    fontSize: 16,
  },
});
