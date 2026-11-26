// Aprende LSP: una ventana con el juego (index.html). El reconocimiento lo hace el cerebro
// (camara-pc + la placa, o solo-pc) y la ventana lo lee en http://127.0.0.1:8000/estado.
const { app, BrowserWindow } = require('electron');
const path = require('path');

function crearVentana() {
  const ventana = new BrowserWindow({
    width: 1366,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#1B1C29',
    autoHideMenuBar: true,
    title: 'Aprende LSP',
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  ventana.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(crearVentana);
app.on('window-all-closed', () => app.quit());
