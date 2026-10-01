# Arquitetura

## Princípio central: simulação separada da renderização

```
src/
  main.ts / app.ts        Bootstrap, troca menu ⇄ sessão, ciclo de vida do Phaser
  config/                 GAME_CONFIG (constantes técnicas) e Settings do jogador
  data/balance.ts         TODO o balanceamento (preços, custos, chances, curvas)
  utils/                  Rng determinístico (mulberry32), math, Emitter tipado
  simulation/             TypeScript puro, sem DOM/Phaser — testável em Node
    types.ts              GameState serializável (única fonte de verdade)
    context.ts            SimContext { state, rng, emit } passado a todos os sistemas
    game.ts               Classe Game: advanceDay(), ações do jogador, fechamento mensal/anual
    time/ world/ soil/ weather/ crops/ market/ buildings/ machinery/
    workers/ finance/ economy/ events/ technology/ progression/
  save/saveManager.ts     Envelope versionado em localStorage + validação
  game/
    GameSession.ts        Controlador: relógio (frames → dias), ferramentas, seleção/prévia, autosave
    scenes/FarmScene.ts   Phaser: tilemap, câmera, input do mapa, sprites, feedback flutuante
    rendering/art.ts      Arte procedural (atlas de tiles extrudado, construções, máquinas)
  ui/                     HUD e painéis em DOM (overlay), sem framework
  i18n/                   pt-BR (padrão) e en
  audio/                  AudioManager WebAudio com fallback silencioso
  analytics/              AnalyticsService (fila local, sem envio externo)
  platform/               GamePlatform + Local/CrazyGames/Poki
```

### Fluxo de um dia

`GameSession.update(dt)` acumula tempo real × velocidade; a cada `msPerDayAt1x` (1200 ms em 1×)
chama `Game.advanceDay()` — no máximo 4 dias por frame para não travar em 8×.
`advanceDay` executa, em ordem: clima → solo/umidade → irrigação → crescimento → máquinas →
funcionários → mercado → eventos → empréstimos → status financeiro → custos mensais →
fechamento anual → progressão. Cada sistema recebe o `SimContext` e comunica mudanças via
`ctx.emit(...)` (ex.: `tilesChanged`, `notification`, `feedback`, `requestSave`).

A cena Phaser e a UI apenas **escutam** eventos e leem o estado; nunca alteram `GameState`
diretamente — toda mutação passa por métodos de `Game` (ações validadas que retornam
`{ ok, reason }`).

### Determinismo

Toda aleatoriedade da simulação usa `Rng` (seed da partida). O estado do RNG é salvo junto
com o jogo, então carregar um save e avançar N dias produz o mesmo resultado.

### Renderização

- Dois `TilemapLayer`s: solo (grama/água/estrada/floresta/preparado) e overlay
  (culturas por estágio, modos de visão umidade/fertilidade, seleção).
- Atualização incremental: apenas tiles reportados em `tilesChanged` são redesenhados.
- Atlas gerado em canvas com extrusão de 1 px para evitar sangramento de bordas.

### UI

DOM puro com o helper `h()` (hyperscript). Painéis são funções `render*(ctx)` recriadas ao
abrir/atualizar; a barra de ação usa assinatura para não ser reconstruída a cada tick.
