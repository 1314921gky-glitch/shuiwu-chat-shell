/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEV_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
