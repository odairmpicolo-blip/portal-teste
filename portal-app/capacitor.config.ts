import type { CapacitorConfig } from '@capacitor/cli'

/**
 * App mobile interno (Android + iOS) — WebView Capacitor apontando para produção.
 * Sem Play Store / App Store; instalação manual restrita.
 */
const PORTAL_URL = process.env.CAPACITOR_PORTAL_URL || 'https://www.portalciop.com.br/app/'

const config: CapacitorConfig = {
  appId: 'com.portalciop.internal',
  appName: 'Portal CIOP',
  webDir: 'www',
  server: {
    url: PORTAL_URL,
    cleartext: false,
    androidScheme: 'https',
    allowNavigation: [
      'www.portalciop.com.br',
      'portalciop.com.br',
      '*.portalciop.com.br',
      'portal-ciop.firebaseapp.com',
      '*.googleapis.com',
      '*.google.com',
      'accounts.google.com',
      'odairmpicolo-blip.github.io',
    ],
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#0f172a',
  },
  ios: {
    backgroundColor: '#0f172a',
    contentInset: 'automatic',
    scrollEnabled: true,
  },
}

export default config
