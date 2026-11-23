/**
 * Fila de sugerencias de frases. Se usa en la sesión real y en el modo
 * práctica: el motor de `domain/frases` no sabe de dónde viene el texto.
 */

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { COLOR, FUENTE } from '@/constants/tema';
import type { Frase, SugerenciaFrase } from '@/domain/frases';

interface Props {
  sugerencias: SugerenciaFrase[];
  onElegir: (frase: Frase) => void;
}

export function SugerenciasFrases({ sugerencias, onElegir }: Props) {
  if (sugerencias.length === 0) return null;

  return (
    <View style={styles.bloque}>
      <Text style={styles.titulo}>Sugerencias</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.fila}
      >
        {sugerencias.map(({ frase, tipo }) => (
          <Pressable
            key={frase.id}
            onPress={() => onElegir(frase)}
            style={({ pressed }) => [
              styles.chip,
              tipo === 'frase' && styles.chipFrase,
              pressed && styles.chipPulsado,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Completar con ${frase.texto}`}
          >
            <Text style={styles.chipTexto}>{frase.texto}</Text>
            <Text style={[styles.chipTipo, tipo === 'frase' && { color: COLOR.guante }]}>
              {tipo === 'frase' ? 'frase' : 'palabra'}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bloque: {
    gap: 8,
  },
  titulo: {
    fontFamily: FUENTE.negrita,
    fontSize: 13,
    color: COLOR.suave,
  },
  fila: {
    gap: 8,
    paddingRight: 4,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLOR.borde,
    backgroundColor: COLOR.capa,
    paddingVertical: 9,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chipFrase: {
    borderColor: COLOR.guanteBorde,
    backgroundColor: COLOR.guanteSuave,
  },
  chipPulsado: {
    opacity: 0.7,
  },
  chipTexto: {
    fontFamily: FUENTE.negrita,
    fontSize: 14,
    color: COLOR.texto,
  },
  chipTipo: {
    fontFamily: FUENTE.normal,
    fontSize: 11,
    color: COLOR.tenue,
  },
});
