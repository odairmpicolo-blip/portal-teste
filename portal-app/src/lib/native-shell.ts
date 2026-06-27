/**
 * Estilos exclusivos do app nativo (Capacitor).
 * Só aplicam com html.native-app — a versão web não é afetada.
 */

import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { portalAsset } from './portal-origin'

const NATIVE_CSS_ID = 'portal-app-native-css'

export function isNativePlatform(): boolean {
  try {
    if (document.documentElement.classList.contains('native-app')) return true
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

function injectNativeStylesheet(): void {
  if (document.getElementById(NATIVE_CSS_ID)) return
  const link = document.createElement('link')
  link.id = NATIVE_CSS_ID
  link.rel = 'stylesheet'
  link.href = portalAsset('/assets/css/app-native.css')
  document.head.appendChild(link)
}

export async function initNativeShell(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  document.documentElement.classList.add('native-app')
  injectNativeStylesheet()

  try {
    await StatusBar.setStyle({ style: Style.Dark })
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: '#070d18' })
    }
  } catch {
    /* plugin opcional */
  }
}

/** Aplica tema app dentro de iframes legados (mesma origem). */
export function injectLegacyNativeFrame(doc: Document): void {
  if (!isNativePlatform()) return

  doc.documentElement.classList.add('native-app', 'native-embedded')

  const viewport = doc.querySelector('meta[name="viewport"]')
  if (viewport) {
    viewport.setAttribute(
      'content',
      'width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1',
    )
  }

  if (!doc.getElementById(NATIVE_CSS_ID)) {
    const link = doc.createElement('link')
    link.id = NATIVE_CSS_ID
    link.rel = 'stylesheet'
    link.href = portalAsset('/assets/css/app-native.css')
    doc.head.appendChild(link)
  }
}
