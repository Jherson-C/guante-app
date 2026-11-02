/**
 * Modo práctica: la etapa estática de la app.
 *
 * No usa Bluetooth ni sensores. Sirve para tres cosas mientras el guante no
 * está soldado:
 *   1. Probar el abecedario completo (27 letras) y los signos de puntuación.
 *   2. Probar frases completas, tanto deletreadas como enviadas de una sola vez.
 *   3. Reproducir un guion de conversación letra por letra para una demo.
 *
 * El texto y la confianza son simulados; la pantalla lo dice explícitamente
 * para que nadie confunda esto con un reconocimiento real.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { SugerenciasFrases } from '@/components/sugerencias-frases';
import {
  ABECEDARIO,
  LETRAS_MOVIMIENTO,
  SIGNOS,
} from '@/domain/abecedario';
import {
  CATEGORIAS,
  ETIQUETAS_CATEGORIA,
  FRASES,
  GUIONES,
  frasePorId,
  type Frase,
  type Guion,
} from '@/domain/frases';
import { usePractica } from '@/hooks/use-practica';

type Pestana = 'letras' | 'frases' | 'guion';

interface TokenReproduccion {
  cancelado: boolean;
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export default function Practica() {
  const {
    texto,
    confianza,
    ultimoEvento,
    sugerencias,
    pulsarLetra,
    pulsarEspacio,
    pulsarBorrar,
    limpiar,
    enviarFrase,
    completar,
  } = usePractica();

  const [pestana, setPestana] = useState<Pestana>('letras');
  const [reproduciendoId, setReproduciendoId] = useState<string | null>(null);
  const tokenRef = useRef<TokenReproduccion | null>(null);

  const { width } = useWindowDimensions();
  const columnas = 6;
  const anchoUtil = Math.max(240, Math.min(width - 40, 520));
  const anchoTecla = Math.min(
    56,
    Math.max(38, Math.floor((anchoUtil - 6 * (columnas - 1)) / columnas)),
  );

  const grupos = useMemo(
    () =>
      CATEGORIAS.map((categoria) => ({
        categoria,
        frases: FRASES.filter((frase) => frase.categoria === categoria),
      })).filter((grupo) => grupo.frases.length > 0),
    [],
  );

  const detener = useCallback(() => {
    if (tokenRef.current) tokenRef.current.cancelado = true;
    tokenRef.current = null;
    setReproduciendoId(null);
  }, []);

  const escribir = useCallback(
    (accion: () => void) => {
      if (tokenRef.current) detener();
      accion();
    },
    [detener],
  );

  const reproducir = useCallback(
    async (guion: Guion) => {
      detener();
      const token: TokenReproduccion = { cancelado: false };
      tokenRef.current = token;
      setReproduciendoId(guion.id);
      limpiar();
      await esperar(450);

      for (const id of guion.frases) {
        if (token.cancelado) return;
        const frase = frasePorId(id);
        if (!frase) continue;

        for (const caracter of frase.texto) {
          if (token.cancelado) return;
          if (caracter === ' ') pulsarEspacio();
          else pulsarLetra(caracter);
          await esperar(180);
        }
        // Cierra la frase con un espacio y normaliza tildes/signos.
        pulsarEspacio();
        await esperar(1100);
      }

      if (token.cancelado) return;
      tokenRef.current = null;
      setReproduciendoId(null);
    },
    [detener, limpiar, pulsarEspacio, pulsarLetra],
  );

  // Si se sale de la pantalla, el guion en curso no debe seguir escribiendo.
  useEffect(
    () => () => {
      if (tokenRef.current) tokenRef.current.cancelado = true;
    },
    [],
  );

  const salir = useCallback(() => {
    detener();
    router.replace('/');
  }, [detener]);

  return (
    <View style={styles.contenedor}>
      <View style={styles.cabecera}>
        <Pressable
          onPress={salir}
          accessibilityRole="button"
          accessibilityLabel="Salir del modo práctica"
          hitSlop={10}
        >
          <Text style={styles.volver}>← Salir</Text>
        </Pressable>
        <View style={styles.badgeModo}>
          <Text style={styles.badgeModoTexto}>MODO PRÁCTICA</Text>
        </View>
        <View style={styles.badgeSimulado}>
          <View style={styles.puntoSimulado} />
          <Text style={styles.badgeSimuladoTexto}>SIMULADO</Text>
        </View>
      </View>

      <Text style={styles.subtitulo}>
        Sin guante conectado · texto y confianza simulados
      </Text>

      <View style={styles.textoZona}>
        <Text
          style={styles.texto}
          numberOfLines={3}
          adjustsFontSizeToFit
          minimumFontScale={0.35}
          accessibilityLabel="Texto de práctica"
        >
          {texto || '…'}
        </Text>
      </View>

      <View style={styles.estado}>
        <Text style={styles.estadoTexto} numberOfLines={1}>
          {ultimoEvento ?? 'Toca una letra o una frase para empezar'}
        </Text>
        {confianza !== null ? (
          <Text style={styles.confianza}>{confianza}%</Text>
        ) : null}
      </View>

      <SugerenciasFrases
        sugerencias={sugerencias}
        onElegir={(frase: Frase) => escribir(() => completar(frase))}
      />

      <View style={styles.tabs}>
        {(['letras', 'frases', 'guion'] as const).map((valor) => (
          <Pressable
            key={valor}
            onPress={() => {
              detener();
              setPestana(valor);
            }}
            style={[styles.tab, pestana === valor && styles.tabActiva]}
            accessibilityRole="button"
            accessibilityLabel={`Ver ${valor}`}
          >
            <Text
              style={[styles.tabTexto, pestana === valor && styles.tabTextoActivo]}
            >
              {valor === 'letras' ? 'Letras' : valor === 'frases' ? 'Frases' : 'Guion'}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.panel}>
        {pestana === 'letras' ? (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollLetras}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.leyenda}>Abecedario completo · 27 letras</Text>
            <View style={styles.grilla}>
              {ABECEDARIO.map(({ letra, tipo, nota }) => (
                <Pressable
                  key={letra}
                  onPress={() => escribir(() => pulsarLetra(letra))}
                  style={({ pressed }) => [
                    styles.tecla,
                    { width: anchoTecla, height: anchoTecla },
                    pressed && styles.teclaPulsada,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Letra ${letra}${
                    tipo === 'movimiento' ? `, ${nota ?? 'requiere movimiento'}` : ''
                  }`}
                >
                  <Text style={styles.teclaTexto}>{letra}</Text>
                  {tipo === 'movimiento' ? (
                    <View style={styles.puntoMovimiento} />
                  ) : null}
                </Pressable>
              ))}
            </View>

            <View style={styles.filaSignos}>
              <Text style={styles.etiquetaPequena}>Signos</Text>
              {SIGNOS.map((signo) => (
                <Pressable
                  key={signo}
                  onPress={() => escribir(() => pulsarLetra(signo))}
                  style={({ pressed }) => [
                    styles.teclaSigno,
                    pressed && styles.teclaPulsada,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Signo ${signo}`}
                >
                  <Text style={styles.signoTexto}>{signo}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.leyenda}>
              ● {LETRAS_MOVIMIENTO.join(', ')} se trazan en el aire; el resto son
              poses estáticas. El modo práctica permite todas para armar frases.
            </Text>
          </ScrollView>
        ) : null}

        {pestana === 'frases' ? (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollFrases}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.ayudaPanel}>
              Toca una frase para enviarla como una seña ya aprendida (como si el
              guante la mandara completa). También puedes deletrearla en la
              pestaña Letras.
            </Text>

            {grupos.map(({ categoria, frases }) => (
              <View key={categoria} style={styles.grupo}>
                <Text style={styles.grupoTitulo}>
                  {ETIQUETAS_CATEGORIA[categoria]}
                </Text>
                <View style={styles.chips}>
                  {frases.map((frase) => (
                    <Pressable
                      key={frase.id}
                      onPress={() => escribir(() => enviarFrase(frase))}
                      style={({ pressed }) => [
                        styles.chip,
                        pressed && styles.chipPulsado,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Enviar frase ${frase.texto}`}
                    >
                      <Text style={styles.chipTexto}>{frase.texto}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        ) : null}

        {pestana === 'guion' ? (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollGuiones}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.ayudaPanel}>
              Reproduce una conversación completa letra por letra. Es la misma
              secuencia que podría generar el guante, pero sin hardware.
            </Text>

            {GUIONES.map((guion) => {
              const activo = reproduciendoId === guion.id;
              const frases = guion.frases
                .map((id) => frasePorId(id)?.texto)
                .filter((valor): valor is string => Boolean(valor));

              return (
                <View key={guion.id} style={styles.tarjetaGuion}>
                  <View style={styles.guionCabecera}>
                    <Text style={styles.guionTitulo}>{guion.titulo}</Text>
                    <Pressable
                      onPress={() => {
                        if (activo) detener();
                        else void reproducir(guion);
                      }}
                      style={[
                        styles.botonGuion,
                        activo && styles.botonGuionDetener,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={
                        activo
                          ? `Detener ${guion.titulo}`
                          : `Reproducir ${guion.titulo}`
                      }
                    >
                      <Text style={styles.botonGuionTexto}>
                        {activo ? '■ Detener' : '▶ Reproducir'}
                      </Text>
                    </Pressable>
                  </View>
                  <Text style={styles.guionDescripcion}>{guion.descripcion}</Text>
                  <Text style={styles.guionFrases}>{frases.join(' · ')}</Text>
                </View>
              );
            })}
          </ScrollView>
        ) : null}
      </View>

      <View style={styles.pie}>
        <Pressable
          onPress={() => escribir(pulsarEspacio)}
          style={({ pressed }) => [styles.botonPie, pressed && styles.botonPiePulsado]}
          accessibilityRole="button"
          accessibilityLabel="Agregar un espacio"
        >
          <Text style={styles.botonPieTexto}>ESPACIO</Text>
        </Pressable>
        <Pressable
          onPress={() => escribir(pulsarBorrar)}
          style={({ pressed }) => [styles.botonPie, pressed && styles.botonPiePulsado]}
          accessibilityRole="button"
          accessibilityLabel="Borrar el último carácter"
        >
          <Text style={styles.botonPieTexto}>⌫ BORRAR</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            detener();
            limpiar();
          }}
          style={({ pressed }) => [styles.botonPie, pressed && styles.botonPiePulsado]}
          accessibilityRole="button"
          accessibilityLabel="Limpiar todo el texto"
        >
          <Text style={styles.botonPieTexto}>LIMPIAR</Text>
        </Pressable>
      </View>
    </View>
  );
}

const VERDE = '#4caf7d';
const AMBAR = '#e0b34e';

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: '#000',
    paddingTop: 52,
    paddingHorizontal: 20,
    paddingBottom: 18,
    gap: 10,
  },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  volver: {
    color: '#cfcfcf',
    fontSize: 15,
  },
  badgeModo: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#3b3b3b',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  badgeModoTexto: {
    color: '#e6e6e6',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  badgeSimulado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  puntoSimulado: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: VERDE,
  },
  badgeSimuladoTexto: {
    color: VERDE,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  subtitulo: {
    color: '#6f6f6f',
    fontSize: 11,
    marginTop: -4,
  },
  textoZona: {
    minHeight: 88,
    maxHeight: 170,
    justifyContent: 'center',
    paddingVertical: 4,
  },
  texto: {
    color: '#ffffff',
    fontSize: 48,
    fontWeight: '700',
    textAlign: 'center',
    flexShrink: 1,
  },
  estado: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 18,
  },
  estadoTexto: {
    color: '#8a8a8a',
    fontSize: 12,
    flex: 1,
  },
  confianza: {
    color: VERDE,
    fontSize: 12,
    fontWeight: '600',
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
  },
  tab: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333333',
    paddingVertical: 8,
    alignItems: 'center',
  },
  tabActiva: {
    backgroundColor: '#ffffff',
    borderColor: '#ffffff',
  },
  tabTexto: {
    color: '#bdbdbd',
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextoActivo: {
    color: '#000000',
  },
  panel: {
    flex: 1,
    minHeight: 120,
  },
  scroll: {
    flex: 1,
  },
  scrollLetras: {
    paddingBottom: 10,
    gap: 10,
  },
  grilla: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
  },
  tecla: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333333',
    backgroundColor: '#141414',
    alignItems: 'center',
    justifyContent: 'center',
  },
  teclaPulsada: {
    backgroundColor: '#2b2b2b',
    borderColor: '#5a5a5a',
  },
  teclaTexto: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  puntoMovimiento: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: AMBAR,
  },
  filaSignos: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  etiquetaPequena: {
    color: '#6f6f6f',
    fontSize: 11,
    marginRight: 2,
  },
  teclaSigno: {
    width: 36,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333333',
    backgroundColor: '#141414',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signoTexto: {
    color: '#dedede',
    fontSize: 17,
    fontWeight: '600',
  },
  leyenda: {
    color: '#6f6f6f',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    paddingHorizontal: 6,
  },
  scrollFrases: {
    paddingBottom: 14,
    gap: 14,
  },
  ayudaPanel: {
    color: '#7a7a7a',
    fontSize: 12,
    lineHeight: 17,
  },
  grupo: {
    gap: 7,
  },
  grupoTitulo: {
    color: '#8f8f8f',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#3b3b3b',
    backgroundColor: '#161616',
    paddingVertical: 8,
    paddingHorizontal: 13,
  },
  chipPulsado: {
    backgroundColor: '#2b2b2b',
  },
  chipTexto: {
    color: '#f0f0f0',
    fontSize: 14,
    fontWeight: '600',
  },
  scrollGuiones: {
    paddingBottom: 14,
    gap: 12,
  },
  tarjetaGuion: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333333',
    backgroundColor: '#111111',
    padding: 14,
    gap: 6,
  },
  guionCabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  guionTitulo: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
  botonGuion: {
    borderRadius: 8,
    backgroundColor: VERDE,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  botonGuionDetener: {
    backgroundColor: '#7a3833',
  },
  botonGuionTexto: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  guionDescripcion: {
    color: '#b3b3b3',
    fontSize: 13,
  },
  guionFrases: {
    color: '#6f6f6f',
    fontSize: 11,
    lineHeight: 16,
  },
  pie: {
    flexDirection: 'row',
    gap: 8,
  },
  botonPie: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3b3b3b',
    paddingVertical: 12,
    alignItems: 'center',
  },
  botonPiePulsado: {
    backgroundColor: '#242424',
  },
  botonPieTexto: {
    color: '#e0e0e0',
    fontSize: 13,
    fontWeight: '600',
  },
});
