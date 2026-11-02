/**
 * Pantalla de conexión — flujo definido en SPEC §6: estados legibles,
 * acción de reintento y navegación a la transcripción solo al estar operativo.
 */

import { router } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useGuante } from '@/hooks/use-guante';
import { COLORES_FASE, ETIQUETAS_FASE } from '@/constants/guante-fases';

export default function Conexion() {
  const { fase, detalle, activo, simulado, conectar, desconectar } = useGuante();
  const soloAndroid = Platform.OS !== 'android';

  const ocupado =
    fase === 'verificando' ||
    fase === 'escaneando' ||
    fase === 'conectando' ||
    fase === 'reconectando';

  return (
    <View style={styles.contenedor}>
      <Text style={styles.titulo}>Guante Traductor</Text>

      <View style={styles.estado}>
        <View
          style={[styles.indicador, { backgroundColor: COLORES_FASE[fase] }]}
          accessible
          accessibilityLabel={`Estado de conexión: ${ETIQUETAS_FASE[fase]}`}
        />
        <Text style={[styles.faseTexto, { color: COLORES_FASE[fase] }]}>
          {ETIQUETAS_FASE[fase]}
        </Text>
      </View>
      {detalle ? <Text style={styles.detalle}>{detalle}</Text> : null}
      {simulado ? (
        <Text style={styles.avisoSimulado}>
          Firmware de demostración · datos simulados
        </Text>
      ) : null}

      {soloAndroid ? (
        <Pressable
          style={styles.botonPrimario}
          onPress={() => router.push('/practica')}
          accessibilityRole="button"
          accessibilityLabel="Abrir el modo práctica"
        >
          <Text style={styles.botonPrimarioTexto}>Abrir modo práctica</Text>
        </Pressable>
      ) : activo ? (
        <Pressable
          style={styles.botonPrimario}
          onPress={() => router.push('/conversacion')}
          accessibilityRole="button"
          accessibilityLabel="Abrir el modo conversación de dos vías"
        >
          <Text style={styles.botonPrimarioTexto}>Abrir conversación</Text>
        </Pressable>
      ) : (
        <Pressable
          style={[styles.botonPrimario, ocupado && styles.botonDeshabilitado]}
          onPress={conectar}
          disabled={ocupado}
          accessibilityRole="button"
          accessibilityLabel="Conectar el guante por Bluetooth"
        >
          <Text style={styles.botonPrimarioTexto}>
            {fase === 'inicial' || fase === 'desconectado' || fase === 'no-encontrado'
              ? 'Conectar guante'
              : 'Reintentar'}
          </Text>
        </Pressable>
      )}

      {!soloAndroid && activo ? (
        <Pressable
          style={styles.botonSecundario}
          onPress={() => router.push('/session')}
          accessibilityRole="button"
          accessibilityLabel="Abrir la transcripción con sugerencias"
        >
          <Text style={styles.botonSecundarioTexto}>Abrir transcripción</Text>
        </Pressable>
      ) : null}

      {!soloAndroid && !activo ? (
        <Pressable
          style={styles.botonSecundario}
          onPress={() => router.push('/practica')}
          accessibilityRole="button"
          accessibilityLabel="Probar la app sin guante en modo práctica"
        >
          <Text style={styles.botonSecundarioTexto}>
            Probar sin guante · modo práctica
          </Text>
        </Pressable>
      ) : null}

      {soloAndroid ? (
        <Text style={styles.avisoWeb}>
          En el navegador no hay BLE. Para conectar el guante usá el APK en Android
          o abrí prueba_edwin.html en Chrome. El modo práctica funciona sin
          guante.
        </Text>
      ) : (
        <Text style={styles.ayuda}>
          Enciende el guante y colócalo a menos de un metro del teléfono.
          {'\n'}Recibe en vibración cuando la conexión se establece y con cada letra.
        </Text>
      )}

      {!soloAndroid && fase !== 'inicial' && fase !== 'ble-no-disponible' ? (
        <Pressable
          style={styles.botonSecundario}
          onPress={desconectar}
          accessibilityRole="button"
          accessibilityLabel="Desconectar el guante"
        >
          <Text style={styles.botonSecundarioTexto}>Desconectar</Text>
        </Pressable>
      ) : null}

      <Text style={styles.privacidad}>
        El texto transcrito vive solo en la memoria del teléfono: no se guarda en
        ningún archivo, base de datos o servidor, y se pierde al cerrar la app.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 18,
  },
  titulo: {
    fontSize: 34,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  estado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  indicador: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  faseTexto: {
    fontSize: 18,
    fontWeight: '600',
  },
  detalle: {
    fontSize: 13,
    color: '#9a9a9a',
    textAlign: 'center',
  },
  avisoSimulado: {
    fontSize: 12,
    color: '#e0b34e',
    textAlign: 'center',
    marginTop: -6,
  },
  botonPrimario: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 48,
    marginTop: 12,
  },
  botonPrimarioTexto: {
    color: '#000000',
    fontSize: 22,
    fontWeight: '700',
  },
  botonDeshabilitado: {
    opacity: 0.4,
  },
  ayuda: {
    fontSize: 15,
    color: '#bdbdbd',
    textAlign: 'center',
    lineHeight: 22,
  },
  avisoWeb: {
    fontSize: 13,
    color: '#bdbdbd',
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 4,
  },
  botonSecundario: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#5a5a5a',
    paddingVertical: 10,
    paddingHorizontal: 28,
  },
  botonSecundarioTexto: {
    color: '#dddddd',
    fontSize: 16,
  },
  privacidad: {
    fontSize: 12,
    color: '#7a7a7a',
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 10,
  },
});
