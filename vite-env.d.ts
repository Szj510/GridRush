/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_PEERJS_HOST?: string;
  readonly VITE_PEERJS_PORT?: string;
  readonly VITE_PEERJS_PATH?: string;
  readonly VITE_PEERJS_SECURE?: string;
  readonly VITE_PEERJS_KEY?: string;
  readonly VITE_PEERJS_ENABLE_DISCOVERY?: string;
  readonly VITE_NET_USE_SUPABASE_RELAY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
