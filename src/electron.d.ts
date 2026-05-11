export interface ElectronAPI {
  ping: () => string;
  readLockfile: () => Promise<{ port: string; password: string; protocol: string } | null>;
  lcuRequest: (params: { path: string; method?: string; body?: any }) => Promise<any>;
  gameRequest: (params: { path: string }) => Promise<any>;
  lcuRuneImport: (pageData: any) => Promise<any>;
  onTriggerRuneImport: (callback: () => void) => void;
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
