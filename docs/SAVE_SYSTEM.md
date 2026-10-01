# Sistema de save

- **Armazenamento**: `localStorage`, chave `open-farm-tycoon.save` (configurações em
  `open-farm-tycoon.settings`). Se `localStorage` não estiver disponível (modo privado,
  iframe bloqueado), o jogo roda normalmente e avisa que o progresso não será salvo.
- **Envelope**: `{ saveVersion, game, savedAt, state }`. `state` é o `GameState`
  completo e serializável, incluindo o estado do RNG (determinismo após carregar).
- **Quando salva**: autosave a cada 60 s de jogo ativo, após ações importantes
  (compra de terra, construção, empréstimo...), botão **Salvar**, ao sair para o menu, ao
  fechar a aba (`beforeunload`) e ao esconder a aba (`visibilitychange`).
- **Validação**: `validateState()` confere versão, campos obrigatórios, tamanho do mapa e
  números finitos. Saves inválidos ou com versão diferente retornam `corrupt`.
- **Save corrompido**: o menu avisa, desabilita "Continuar" e oferece novo jogo; o arquivo
  só é sobrescrito quando o jogador inicia uma nova partida (confirmação de sobrescrita).
- **Excluir save**: em Configurações (no menu principal), com confirmação.
- **Migrações**: `saveVersion` = 1. Ao mudar o formato, incremente `GAME_CONFIG.saveVersion` e
  adicione uma função de migração `vN → vN+1` em `saveManager.ts` antes da validação.
- **Plataformas**: a interface `GamePlatform` tem `saveData/loadData` opcionais para nuvem
  (não usados ainda — localStorage é a fonte de verdade).
