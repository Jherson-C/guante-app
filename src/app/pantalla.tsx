/**
 * Pantalla completa — modo conversación.
 *
 * Es la misma transcripción de `useGuante`, pero sin sugerencias, botones ni
 * panel de depuración: solo el texto enorme para que la otra persona lo lea
 * mientras el usuario mueve la mano. Tocar la pantalla muestra los controles
 * de espacio/borrar/limpiar; la × vuelve a la pantalla anterior.
 */

import { useEffect, useState } from 'react';
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

export default function PantallaCompleta() {
  const {
    texto,
    fase,
    confianza,
    activo,
    simulado,
    agregarEspacio,
    borrarUltimo,
    limpiarTexto,
  } = useGuante();
  const [controles, setControles] = useState(false);
  const { width } = useWindowDimensions();

  const tamano = Math.min(110, Math.max(52, Math.round(width * 0.2)));

  useEffect(() => {
    void activateKeepAwakeAsync();
  }, []);

  if (!activo) {
    return (
      <View style={[styles.contenedor, styles.centrado]}>
        <Text style={styles.aviso}>El guante no está conectado.</Text>
        <Pressable
          style={styles.botonPrimario}
          onPress={() => router.replace('/')}
          accessibilityRole="button"
          accessibilityLabel="Ir a la pantalla de conexión"
        >
          <Text style={styles.botonPrimarioTexto}>Ir a conectar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.contenedor}>
      <View style={styles.barra}>
        <View style={styles.estado}>
          <View
            style={[styles.punto, { backgroundColor: COLORES_FASE[fase] }]}
          />
          <Text style={styles.estadoTexto}>{ETIQUETAS_FASE[fase]}</Text>
        </View>
        <View style={styles.barraDerecha}>
          {simulado ? <Text style={styles.simulado}>SIMULADO</Text> : null}
          {confianza !== null ? (
            <Text style={styles.confianza}>{confianza}%</Text>
          ) : null}
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Salir de pantalla completa"
          >
            <Text style={styles.cerrar}>×</Text>
          </Pressable>
        </View>
      </View>

      <Pressable
        style={styles.area}
        onPress={() => setControles((valor) => !valor)}
        accessibilityRole="button"
        accessibilityLabel="Mostrar u ocultar controles de edición"
      >
        <Text
          style={[styles.texto, { fontSize: tamano }]}
          numberOfLines={5}
          adjustsFontSizeToFit
          minimumFontScale={0.25}
        >
          {texto || '…'}
        </Text>
      </Pressable>

      {controles ? (
        <View style={styles.pie}>
          <Pressable
            style={styles.botonPie}
            onPress={agregarEspacio}
            accessibilityRole="button"
            accessibilityLabel="Agregar un espacio"
          >
            <Text style={styles.botonPieTexto}>ESPACIO</Text>
          </Pressable>
          <Pressable
            style={styles.botonPie}
            onPress={borrarUltimo}
            accessibilityRole="button"
            accessibilityLabel="Borrar el último carácter"
          >
            <Text style={styles.botonPieTexto}>⌫ BORRAR</Text>
          </Pressable>
          <Pressable
            style={styles.botonPie}
            onPress={limpiarTexto}
            accessibilityRole="button"
            accessibilityLabel="Limpiar todo el texto"
          >
            <Text style={styles.botonPieTexto}>LIMPIAR</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.hint}>Tocá la pantalla para los controles</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: '#000',
  },
  centrado: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    padding: 24,
  },
  barra: {
    position: 'absolute',
    top: 42,
    left: 20,
    right: 20,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    fontSize: 11,
    flexShrink: 1,
  },
  barraDerecha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  confianza: {
    color: '#8a8a8a',
    fontSize: 12,
  },
  simulado: {
    color: '#e0b34e',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cerrar: {
    color: '#8a8a8a',
    fontSize: 28,
    lineHeight: 30,
  },
  area: {
    flex: 1,
    justifyContent: 'center',
    paddingTop: 78,
    paddingBottom: 64,
    paddingHorizontal: 16,
  },
  texto: {
    color: '#ffffff',
    fontWeight: '700',
    textAlign: 'center',
  },
  hint: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    color: '#4f4f4f',
    fontSize: 11,
    textAlign: 'center',
  },
  pie: {
    position: 'absolute',
    bottom: 18,
    left: 16,
    right: 16,
    flexDirection: 'row',
    gap: 8,
  },
  botonPie: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3b3b3b',
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#111111',
  },
  botonPieTexto: {
    color: '#e0e0e0',
    fontSize: 13,
    fontWeight: '600',
  },
  aviso: {
    color: '#ffffff',
    fontSize: 22,
    textAlign: 'center',
  },
  botonPrimario: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 40,
  },
  botonPrimarioTexto: {
    color: '#000000',
    fontSize: 18,
    fontWeight: '700',
  },
});
