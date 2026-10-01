# Open Farm Tycoon

Jogo de gestão agrícola (tycoon) para navegador, feito com **TypeScript + Phaser 3 + Vite**.
Compre terras, prepare o solo, plante, irrigue, colha, armazene e venda no mercado — enquanto
administra clima, máquinas, funcionários, construções, empréstimos e o caixa da fazenda.

> Projeto original. Não usa código, arte, nomes ou recursos de jogos proprietários.
> Toda a arte é gerada proceduralmente em canvas e o áudio é sintetizado via WebAudio.

## Requisitos

- Node.js 20+ (testado com Node 22)
- npm 10+

## Comandos

```bash
npm install        # instala dependências
npm run dev        # servidor de desenvolvimento (http://localhost:5173)
npm run test       # testes unitários + integração (Vitest)
npm run lint       # ESLint (flat config, typescript-eslint)
npm run typecheck  # tsc --noEmit (strict)
npm run build      # typecheck + build de produção em dist/
npm run preview    # serve dist/ (http://localhost:4173)
npm run format     # Prettier
```

O build é estático (`base: './'`), então `dist/` pode ser publicado em qualquer hospedagem
estática ou empacotado em .zip para portais (CrazyGames, Poki).

## Como jogar (resumo)

1. **Novo jogo** → nome da fazenda, dificuldade, região, seed (opcional) e tutorial.
2. Selecione uma ferramenta (barra à esquerda) e **arraste um retângulo** sobre seu lote:
   `Preparar (P)` → `Plantar (L)` → `Irrigar (I)` → aguarde → `Colher (H)`.
   Cada ação mostra uma prévia com área, custo, capacidade do dia e efeito; confirme com **Enter**.
3. Abra o **Mercado** e venda 25/50/100% ou uma quantidade específica do estoque.
4. Expanda: **Comprar terra (B)** em lotes vizinhos, **Construir (C)** silos/galpões/oficina/
   escritório/estação de irrigação, compre máquinas, contrate funcionários, pesquise tecnologias.
5. Cuidado com o caixa: saldo negativo leva a alerta → inadimplência → falência.

Atalhos: `V/B/P/L/I/H/C` ferramentas, `Esc` cancelar, `Espaço` pausar/retomar, `0` pausa, `1–4` velocidades 1×/2×/4×/8×, `+`/`-` zoom,
`WASD`/setas movem a câmera, roda do mouse dá zoom, botão direito/meio arrasta,
`F3` ou `` ` `` painel de debug (apenas em `npm run dev`).

## Plataformas

A plataforma é escolhida por `VITE_PLATFORM` no build ou por `?platform=` na URL:
`local` (padrão), `crazygames`, `poki`. Veja [docs/PLATFORMS.md](docs/PLATFORMS.md).

## Documentação

- [Arquitetura](docs/ARCHITECTURE.md)
- [Game design](docs/GAME_DESIGN.md)
- [Economia e balanceamento](docs/ECONOMY.md)
- [Sistema de save](docs/SAVE_SYSTEM.md)
- [Testes](docs/TESTING.md)
- [Plataformas](docs/PLATFORMS.md), [CrazyGames](docs/CRAZYGAMES.md), [Poki](docs/POKI.md)
- [Roadmap](docs/ROADMAP.md)
- [Avisos de terceiros](THIRD_PARTY_NOTICES.md)

## Licença

Código do projeto: todos os direitos reservados ao autor, salvo definição posterior de licença.
Dependências de terceiros seguem suas próprias licenças (ver THIRD_PARTY_NOTICES.md).
