# Plataformas

O jogo conversa com portais apenas através da interface `GamePlatform`
(`src/platform/GamePlatform.ts`):

```ts
interface GamePlatform {
  readonly id: 'local' | 'crazygames' | 'poki';
  initialize(): Promise<void>;
  gameplayStart(): void; // jogo rodando (não pausado, sem modal)
  gameplayStop(): void; // menu, pausa, modal
  showInterstitial(): Promise<void>; // pausa natural (sair para o menu)
  showRewardedAd(): Promise<boolean>; // opcional, não usado no loop atual
  saveData?(data: unknown): Promise<void>;
  loadData?(): Promise<unknown>;
}
```

| Implementação        | Status                                                                            |
| -------------------- | --------------------------------------------------------------------------------- |
| `LocalPlatform`      | IMPLEMENTADO — no-ops, padrão                                                     |
| `CrazyGamesPlatform` | IMPLEMENTADO (código), **EXTERNAL_CONFIGURATION_REQUIRED** para validar no portal |
| `PokiPlatform`       | IMPLEMENTADO (código), **EXTERNAL_CONFIGURATION_REQUIRED** para validar no portal |

## Seleção

1. `?platform=crazygames|poki|local` na URL (útil para testar), senão
2. `VITE_PLATFORM` no build (`.env` / variável de ambiente), senão
3. `local`.

```bash
VITE_PLATFORM=crazygames npm run build
VITE_PLATFORM=poki npm run build
```

## Garantias

- SDKs são carregados dinamicamente via `<script>` com timeout de 8 s; falha ⇒ no-ops.
- Nenhuma chamada de SDK pode lançar exceção para o jogo (try/catch em todas).
- O áudio é suspenso durante o interstitial; o relógio do jogo pausa (e `gameplayStop` é
  chamado) enquanto há modal aberto ou o jogo está pausado.
- Nenhuma credencial ou chave de API é necessária no frontend.
