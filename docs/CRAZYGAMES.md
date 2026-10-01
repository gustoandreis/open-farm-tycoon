# CrazyGames

Status: **código implementado; validação no portal = EXTERNAL_CONFIGURATION_REQUIRED**
(requer conta de desenvolvedor CrazyGames — nenhuma credencial é necessária no código).

## Build

```bash
VITE_PLATFORM=crazygames npm run build
cd dist && zip -r ../open-farm-tycoon-crazygames.zip .
```

## O que a integração faz (`src/platform/CrazyGamesPlatform.ts`)

- Carrega `https://sdk.crazygames.com/crazygames-sdk-v3.js` e chama `SDK.init()`.
- `game.gameplayStart()` / `gameplayStop()` ao rodar/pausar/abrir modais.
- `ad.requestAd('midgame')` ao sair para o menu (pausa natural).
- `ad.requestAd('rewarded')` disponível via `showRewardedAd()` (sem uso no jogo ainda).

## Checklist para publicar

1. Criar conta em developer.crazygames.com e o jogo no painel.
2. Subir o .zip; testar no **QA tool / preview** do portal.
3. Conferir: carregamento < 50 MB (atual ≈ 1,4 MB), sem links externos, funciona em iframe,
   áudio respeita mute, `gameplayStart/Stop` corretos.
4. Opcional: usar `SDK.data` para save em nuvem implementando `saveData/loadData`.
