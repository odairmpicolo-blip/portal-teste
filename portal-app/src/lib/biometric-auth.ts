import { BiometricAuth, BiometryError, BiometryErrorType } from '@aparajita/capacitor-biometric-auth'
import { isNativeApp } from './portal-origin'

export async function isBiometricAvailable(): Promise<boolean> {
  if (!isNativeApp()) return false
  try {
    const info = await BiometricAuth.checkBiometry()
    return info.isAvailable
  } catch {
    return false
  }
}

export async function promptBiometric(reason = 'Confirme sua identidade para acessar o Portal CIOP'): Promise<boolean> {
  if (!isNativeApp()) return true
  try {
    const available = await isBiometricAvailable()
    if (!available) return false
    await BiometricAuth.authenticate({
      reason,
      cancelTitle: 'Cancelar',
      allowDeviceCredential: true,
      iosFallbackTitle: 'Usar senha do iPhone',
      androidTitle: 'Portal CIOP',
      androidSubtitle: 'Use Face ID ou impressão digital',
    })
    return true
  } catch (error) {
    if (error instanceof BiometryError && error.code === BiometryErrorType.userCancel) {
      return false
    }
    return false
  }
}
