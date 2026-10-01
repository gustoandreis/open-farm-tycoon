# Poki

Status: **código implementado; validação no portal = EXTERNAL_CONFIGURATION_REQUIRED**
(requer aprovação/conta Poki for Developers — nenhuma credencial é necessária no código).

## Build

```bash
VITE_PLATFORM=poki npm run build
cd dist && zip -r ../open-farm-tycoon-poki.zip .
```

## O que a integração faz (`src/platform/PokiPlatform.ts`)

- Carrega `https://game-cdn.poki.com/scripts/v2/poki-sdk.js`, `PokiSDK.init()` e
  `gameLoadingFinished()`.
- `gameplayStart()` / `gameplayStop()` ao rodar/pausar/abrir modais.
- `commercialBreak()` ao sair para o menu.
- `rewardedBreak()` disponível via `showRewardedAd()`.

## Checklist para publicar

1. Inscrever o jogo em developers.poki.com.
2. Subir o build no Poki Inspector e validar os eventos do SDK.
3. Conferir tamanho inicial (Phaser ≈ 320 KB gzip), funcionamento em iframe e mobile.
