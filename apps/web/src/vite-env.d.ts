/// <reference types="vite/client" />

export interface ElectronWindowApi {
  minimize: () => void
  maximize: () => void
  close: () => void
}

declare global {
  interface Window {
    api?: {
      window?: ElectronWindowApi
    }
  }
}

export {}
