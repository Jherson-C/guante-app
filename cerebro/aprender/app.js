// Aprende LSP: muestra una letra con su guía, lee lo que reconoce el cerebro y celebra cuando coincide.
'use strict';
const ESTADO = 'http://127.0.0.1:8000/estado';   // el cerebro (camara-pc pasa el puerto de la placa a esta PC)
const VIDEO = 'http://127.0.0.1:8002/video';     // la cámara con las manos marcadas (camara-pc / solo-pc)
const LETRAS = 'A B C D E F G H I J K L M N Ñ O P Q R S T U V W X Y Z'.split(' ');
const CON_MOVIMIENTO = new Set(['J', 'Ñ', 'Z']);
const NO_SON_SENAS = new Set(['REPOSO', 'TRANSICION']);
const $ = id => document.getElementById(id);

const juego = { cola: [], i: 0, puntos: 0, racha: 0, mejorRacha: 0, logradas: [], saltadas: [], ultimoTotal: null, bloqueado: false };

// ---------- Pantallas ----------
function mostrar(id) { for (const p of ['inicio', 'juego', 'fin']) $(p).hidden = p !== id; }
function mezclar(xs) { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function empezar(cola) {
  Object.assign(juego, { cola, i: 0, puntos: 0, racha: 0, mejorRacha: 0, logradas: [], saltadas: [], ultimoTotal: null, bloqueado: false });
  pintarMarcador();
  mostrar('juego');
  $('video').src = VIDEO + '?' + Date.now();
  ponerLetra();
}

function ponerLetra() {
  const letra = juego.cola[juego.i];
  $('letra').textContent = letra;
  $('avisoMov').hidden = !CON_MOVIMIENTO.has(letra);
  $('contador').textContent = `${juego.i + 1} de ${juego.cola.length}`;
  $('barraProg').style.width = `${(juego.i / juego.cola.length) * 100}%`;
  verComoRobot(false);
  // Guía: un video propio (videos/<LETRA>.mp4) si existe; si no, el dibujo de la letra.
  const video = $('guiaVideo'), img = $('guiaImg');
  img.hidden = false;
  img.src = `abecedario/${encodeURIComponent(letra)}.png`;
  img.alt = `Cómo se hace la letra ${letra} en LSP`;
  video.hidden = true;
  video.onloadeddata = () => { video.hidden = false; img.hidden = true; };
  video.onerror = () => { video.hidden = true; };
  video.src = `videos/${encodeURIComponent(letra)}.mp4`;
  mensaje('');
}

function verComoRobot(ver) {
  const svg = $('guiaEsqueleto'), letra = juego.cola[juego.i];
  svg.hidden = !ver;
  $('guiaImg').style.display = ver ? 'none' : '';
  $('guiaVideo').style.display = ver ? 'none' : '';
  $('verRobot').textContent = ver ? 'Ver la guía' : 'Ver como el robot';
  if (ver) svg.innerHTML = esqueleto(window.ESQUELETOS[letra]);
}

function esqueleto(p) {
  if (!p) return '';
  const HUESOS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[9,10],[10,11],[11,12],[13,14],[14,15],[15,16],[0,17],[17,18],[18,19],[19,20],[5,9],[9,13],[13,17]];
  const xs = p.map(q => q[0]), ys = p.map(q => q[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const P = p.map(([x, y]) => [50 + (x - cx) * 80, 50 + (y - cy) * 80]);
  const lineas = HUESOS.map(([a, b]) => `<line x1="${P[a][0]}" y1="${P[a][1]}" x2="${P[b][0]}" y2="${P[b][1]}"/>`).join('');
  const puntos = P.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${[4, 8, 12, 16, 20].includes(i) ? 3.4 : 2.4}"/>`).join('');
  return `<g stroke="#3B2BD4" stroke-width="2.4" stroke-linecap="round">${lineas}</g><g fill="#FFC94D" stroke="#1B1C29" stroke-width=".8">${puntos}</g>`;
}

// ---------- Resultado de cada intento ----------
function logrado() {
  const letra = juego.cola[juego.i];
  juego.bloqueado = true;
  juego.racha += 1;
  juego.mejorRacha = Math.max(juego.mejorRacha, juego.racha);
  const ganados = 10 + Math.min(juego.racha - 1, 5) * 2;   // la racha suma hasta +10 extra
  juego.puntos += ganados;
  juego.logradas.push(letra);
  pintarMarcador();
  $('exitoPuntos').textContent = juego.racha > 1 ? `+${ganados} · racha de ${juego.racha}` : `+${ganados}`;
  $('exito').hidden = false;
  confeti();
  setTimeout(() => { $('exito').hidden = true; siguiente(); }, 1700);
}

function fallo(visto) {
  juego.racha = 0;
  pintarMarcador();
  mensaje(`Eso pareció «${visto}». Inténtalo otra vez.`);
  const t = $('tarjeta');
  t.classList.remove('falla'); void t.offsetWidth; t.classList.add('falla');
}

function siguiente() {
  juego.i += 1;
  juego.bloqueado = false;
  if (juego.i >= juego.cola.length) return terminar();
  ponerLetra();
}

function terminar() {
  $('video').src = '';
  $('finAciertos').textContent = juego.logradas.length;
  $('finPuntos').textContent = juego.puntos;
  $('finRacha').textContent = juego.mejorRacha;
  $('finPracticar').textContent = juego.saltadas.length ? `Para practicar: ${juego.saltadas.join(', ')}` : '¡No saltaste ninguna letra!';
  $('practicar').hidden = !juego.saltadas.length;
  mostrar('fin');
}

function pintarMarcador() { $('puntos').textContent = juego.puntos; $('racha').textContent = juego.racha; }

let ocultarMensaje;
function mensaje(texto) {
  const m = $('mensaje');
  m.textContent = texto;
  m.classList.toggle('visible', Boolean(texto));
  clearTimeout(ocultarMensaje);
  if (texto) ocultarMensaje = setTimeout(() => m.classList.remove('visible'), 2600);
}

function confeti() {
  const c = $('confeti'), colores = ['#FFC94D', '#5A4CEB', '#ffffff', '#3FBF7F', '#D4D6DE'];
  c.innerHTML = '';
  for (let k = 0; k < 70; k++) {
    const pieza = document.createElement('i');
    pieza.style.left = `${Math.random() * 100}%`;
    pieza.style.background = colores[k % colores.length];
    pieza.style.animationDelay = `${Math.random() * 0.4}s`;
    pieza.style.animationDuration = `${1.1 + Math.random() * 0.8}s`;
    c.appendChild(pieza);
  }
}

// ---------- Lo que reconoce el cerebro ----------
async function leerEstado() {
  try {
    const r = await fetch(ESTADO, { signal: AbortSignal.timeout(1500), cache: 'no-store' });
    const e = await r.json();
    conexion(true);
    const ahora = e.ahora && !NO_SON_SENAS.has(e.ahora) ? e.ahora : '—';
    $('ahora').textContent = ahora;
    if (!$('juego').hidden && Array.isArray(e.emitidas) && typeof e.total === 'number') {
      if (juego.ultimoTotal === null) juego.ultimoTotal = e.total;      // lo de antes de empezar no cuenta
      const nuevas = e.emitidas.slice(e.emitidas.length - Math.min(e.emitidas.length, e.total - juego.ultimoTotal));
      juego.ultimoTotal = e.total;
      if (!juego.bloqueado && nuevas.length) {
        const letra = juego.cola[juego.i];
        if (nuevas.includes(letra)) logrado();
        else fallo(nuevas.at(-1));
      }
    }
  } catch {
    conexion(false);
  }
}

function conexion(ok) {
  $('conexion').classList.toggle('ok', ok);
  $('conexionTexto').textContent = ok ? 'Reconocedor conectado' : 'Sin reconocedor: abre «1 - Abrir el traductor»';
}

// ---------- Botones ----------
$('enOrden').onclick = () => empezar([...LETRAS]);
$('alAzar').onclick = () => empezar(mezclar(LETRAS));
$('conMovimiento').onclick = () => empezar([...CON_MOVIMIENTO]);
$('saltar').onclick = () => { if (juego.bloqueado) return; juego.saltadas.push(juego.cola[juego.i]); juego.racha = 0; pintarMarcador(); siguiente(); };
$('salir').onclick = () => { $('video').src = ''; mostrar('inicio'); };
$('verRobot').onclick = () => verComoRobot($('guiaEsqueleto').hidden);
$('otraVez').onclick = () => mostrar('inicio');
$('practicar').onclick = () => empezar([...juego.saltadas]);
$('video').onerror = () => { if ($('juego').hidden) return; $('sinVideo').hidden = false; $('video').hidden = true; setTimeout(() => { $('video').hidden = false; $('sinVideo').hidden = true; $('video').src = VIDEO + '?' + Date.now(); }, 3000); };

setInterval(leerEstado, 250);
leerEstado();
