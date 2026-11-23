/**
 * Editor con sugerencias: el texto acumulado del guante en grande, frases
 * sugeridas para completarlo y los controles de espacio, borrar y limpiar.
 * Se abre desde el panel "Señales" de la conversación.
 */

import { useMemo } from 'react';
import { router } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Cristal } from '@/components/cristal';
import { Fondo } from '@/components/fondo';
import { Icono } from '@/components/icono';
import { SugerenciasFrases } from '@/components/sugerencias-frases';
import { COLORES_FASE, ETIQUETAS_CORTAS } from '@/constants/guante-fases';
import { COLOR, FUENTE } from '@/constants/tema';
import { completarConFrase, sugerirFrases } from '@/domain/frases';
import type { Frase } from '@/domain/frases';
import { useGuante } from '@/hooks/use-guante';

function Accion({
  etiqueta,
  descripcion,
  alPresionar,
  tono,
}: {
  etiqueta: string;
  descripcion: string;
  alPresionar: () => void;
  tono?: string;
}) {
  return (
    <Pressable
      onPress={alPresionar}
      style={({ pressed }) => [styles.accion, pressed && { opacity: 0.65 }]}
      accessibilityRole="button"
      accessibilityLabel={descripcion}
    >
      <Cristal tinte={tono} style={styles.accionCara}>
        <Text style={[styles.accionTexto, tono ? { color: tono } : null]}>{etiqueta}</Text>
      </Cristal>
    </Pressable>
  );
}

export default function Transcripcion() {
  useKeepAwake();

  const {
    texto,
    fase,
    confianza,
    simulado,
    limpiarTexto,
    agregarEspacio,
    borrarUltimo,
    reemplazarTexto,
    desconectar,
  } = useGuante();
  const sugerencias = useMemo(() => sugerirFrases(texto), [texto]);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const tamano = width > height ? 44 : Math.min(60, Math.max(34, Math.round(width * 0.12)));

  return (
    <View style={styles.raiz}>
      <Fondo activo={texto ? 'guante' : null} />

      <ScrollView
        contentContainerStyle={[
          styles.marco,
          {
            paddingTop: Math.max(insets.top, 12),
            paddingBottom: Math.max(insets.bottom, 14),
            paddingLeft: Math.max(insets.left, 16),
            paddingRight: Math.max(insets.right, 16),
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.barra}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Volver a la conversación"
          >
            <Cristal style={styles.redondo}>
              <Icono nombre="atras" tamano={20} />
            </Cristal>
          </Pressable>
          <Cristal style={styles.chip}>
            <View style={[styles.punto, { backgroundColor: COLORES_FASE[fase] }]} />
            <Text style={styles.chipTexto}>{ETIQUETAS_CORTAS[fase]}</Text>
            {confianza !== null ? <Text style={styles.conf}>{confianza}%</Text> : null}
          </Cristal>
        </View>

        {simulado ? (
          <Text style={styles.simulado}>Firmware de demostración: sin sensores reales</Text>
        ) : null}

        <Cristal fuerte tinte={COLOR.guanteBorde} style={styles.tarjeta}>
          <View style={styles.tarjetaCabecera}>
            <Icono nombre="mano" tamano={14} color={COLOR.guante} />
            <Text style={styles.tarjetaNombre}>Texto del guante</Text>
          </View>
          <Text
            style={[styles.texto, { fontSize: tamano, lineHeight: Math.round(tamano * 1.12) }]}
            accessibilityLabel="Texto transcrito del guante"
          >
            {texto || '…'}
          </Text>
        </Cristal>

        <SugerenciasFrases
          sugerencias={sugerencias}
          // Función sobre el texto más reciente: si llega una letra justo al tocar, no se pierde.
          onElegir={(frase: Frase) => reemplazarTexto((previo) => completarConFrase(previo, frase))}
        />

        <View style={styles.fila}>
          <Accion etiqueta="Espacio" descripcion="Agregar un espacio" alPresionar={agregarEspacio} />
          <Accion
            etiqueta="Borrar"
            descripcion="Borrar el último carácter"
            alPresionar={borrarUltimo}
          />
          <Accion
            etiqueta="Limpiar"
            descripcion="Limpiar todo el texto"
            alPresionar={limpiarTexto}
          />
        </View>

        <View style={styles.fila}>
          <Accion
            etiqueta="Volver"
            descripcion="Volver a la conversación"
            alPresionar={() => router.back()}
          />
          <Accion
            etiqueta="Terminar sesión"
            descripcion="Finalizar la sesión y desconectar el guante"
            tono={COLOR.coral}
            alPresionar={() => {
              desconectar();
              router.replace('/');
            }}
          />
        </View>

        <Text style={styles.pie}>El texto vive solo en la memoria del teléfono.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
    backgroundColor: COLOR.abismo,
  },
  marco: {
    flexGrow: 1,
    gap: 14,
  },
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  redondo: {
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
  },
  conf: {
    fontFamily: FUENTE.negrita,
    fontSize: 12,
    color: COLOR.guante,
  },
  simulado: {
    fontFamily: FUENTE.negrita,
    fontSize: 12,
    color: COLOR.voz,
  },
  tarjeta: {
    flexGrow: 1,
    minHeight: 160,
    padding: 20,
    gap: 10,
    justifyContent: 'center',
    borderRadius: 26,
  },
  tarjetaCabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  tarjetaNombre: {
    fontFamily: FUENTE.negrita,
    fontSize: 12,
    color: COLOR.guante,
  },
  texto: {
    fontFamily: FUENTE.display,
    color: COLOR.texto,
    letterSpacing: -0.8,
  },
  fila: {
    flexDirection: 'row',
    gap: 10,
  },
  accion: {
    flex: 1,
  },
  accionCara: {
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 18,
  },
  accionTexto: {
    fontFamily: FUENTE.negrita,
    fontSize: 14,
    color: COLOR.texto,
  },
  pie: {
    fontFamily: FUENTE.normal,
    fontSize: 11,
    color: COLOR.tenue,
    textAlign: 'center',
  },
});
