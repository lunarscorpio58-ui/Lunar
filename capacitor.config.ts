import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.zomeai.companion',
  appName: 'ZomeAi',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
