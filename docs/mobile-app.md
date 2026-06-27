# Portal CIOP — app mobile (Android + iOS)

Apps **internos** (Capacitor + WebView) que abrem `https://www.portalciop.com.br/app/`.  
**Sem Play Store / App Store** — instalação manual, uso restrito a quem tem login Firebase.

| Plataforma | Pacote | Saída |
|------------|--------|--------|
| Android | `com.portalciop.internal` | `dist-apk/*.apk` |
| iOS | `com.portalciop.internal` | `dist-ipa/*.ipa` ou Run no Xcode |

Atualizações do portal no GitHub Pages aparecem no app **sem reinstalar** o binário.

---

## Pré-requisitos

### Comum
- Node.js 18+
- `cd portal-app && npm ci`

### Android
- [Android Studio](https://developer.android.com/studio) + JDK 17
- `export ANDROID_HOME="$HOME/Library/Android/sdk"`

### iOS (somente Mac)
- [Xcode](https://developer.apple.com/xcode/) completo (App Store — **não** basta Command Line Tools)
- Após instalar: `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`
- [CocoaPods](https://cocoapods.org): `brew install cocoapods`
- Conta Apple ID (grátis: instala no **seu** iPhone por ~7 dias; conta Developer paga: 1 ano + ad-hoc)

---

## Build rápido

Na raiz do repositório:

```bash
chmod +x scripts/build-mobile-app.sh scripts/build-android-apk.sh scripts/build-ios-ipa.sh

# Android + iOS (Mac)
./scripts/build-mobile-app.sh

# Só Android
./scripts/build-mobile-app.sh android

# Só iOS
./scripts/build-mobile-app.sh ios
```

Ambiente de teste (opcional):

```bash
CAPACITOR_PORTAL_URL=https://odairmpicolo-blip.github.io/portal-teste/app/ \
  ./scripts/build-mobile-app.sh android
```

---

## Android — instalar APK

1. Gere: `./scripts/build-android-apk.sh`
2. **USB:** depuração USB → `adb install -r dist-apk/portal-ciop-internal-*.apk`
3. **Arquivo:** copie o `.apk` para o celular e instale (fontes desconhecidas)

---

## iOS — instalar no iPhone

### Opção A — Xcode no aparelho (mais simples)

```bash
cd portal-app
npm run cap:sync:ios
npm run cap:open:ios
```

No Xcode:
1. Conecte o iPhone
2. **App** → **Signing & Capabilities** → **Team** (seu Apple ID)
3. Selecione o iPhone como destino
4. **Product → Run** (▶)

> Com Apple ID gratuito o app expira em ~7 dias; rode de novo no Xcode para renovar.

### Opção B — IPA (script)

```bash
# Conta Developer: registre o UDID do iPhone em developer.apple.com
export IOS_TEAM_ID="XXXXXXXXXX"   # Team ID do Xcode
export IOS_EXPORT_METHOD=development  # ou ad-hoc
./scripts/build-ios-ipa.sh
```

Instale o `.ipa` via **Apple Configurator 2**, **Finder** (arrastar para o iPhone) ou ferramentas de deploy interno.

---

## Restringir uso

- Não publique APK/IPA em lojas públicas
- Login continua via **Firebase** (e-mail/senha cadastrados no portal)
- Mesmo `appId` nos dois sistemas: só instalação manual + autenticação

---

## Manutenção

```bash
cd portal-app
npm run cap:sync          # Android + iOS
npm run cap:sync:android
npm run cap:sync:ios
npm run cap:open:android  # Android Studio
npm run cap:open:ios      # Xcode
```

Arquivos principais:
- `portal-app/capacitor.config.ts` — URL do portal, appId, navegação permitida
- `portal-app/www/index.html` — fallback offline (“Conectando…”)
