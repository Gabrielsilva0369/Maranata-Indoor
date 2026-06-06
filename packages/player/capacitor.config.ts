import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.maranata.indoor',
  appName: 'Maranata Player',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
    captureInput: false,
  },
  server: {
    // O APK carrega o player HOSPEDADO (não o embutido). Assim, pra atualizar o
    // app basta publicar a versão nova no site — as telas pegam sozinhas, sem
    // reinstalar APK. O Service Worker garante o offline depois da 1ª carga.
    url: 'https://maranata-indoor-player.vercel.app',
    androidScheme: 'https',
    cleartext: true,
  },
};

export default config;
