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
    androidScheme: 'https',
    cleartext: true,
  },
};

export default config;
