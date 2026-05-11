import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => 'pong-v5',
  readLockfile: () => ipcRenderer.invoke('read-lockfile'),
  lcuRequest: (params: { path: string, method?: string, body?: any }) => 
    ipcRenderer.invoke('lcu-request', params),
  gameRequest: (params: { path: string }) => 
    ipcRenderer.invoke('game-request', params),
  lcuRuneImport: (pageData: any) => 
    ipcRenderer.invoke('lcu-rune-import', pageData),
  onTriggerRuneImport: (callback: () => void) =>
    ipcRenderer.on('trigger-rune-import', (_event) => callback()),
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) =>
    ipcRenderer.send('set-ignore-mouse-events', ignore, options),
});
