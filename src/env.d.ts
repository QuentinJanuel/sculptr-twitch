/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Where the relay is, from .env.development or .env.production. */
  readonly VITE_TWITCH_SERVER: string;
  /** The catalogue API, where a round's game comes from. */
  readonly VITE_FRUIT_PIE_API: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
