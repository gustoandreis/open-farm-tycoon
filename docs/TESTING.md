# Testes

```bash
npm run test        # vitest run (ambiente node, sem navegador)
npm run lint
npm run typecheck
npm run build
```

## Suítes (`tests/`)

| Arquivo             | Cobre                                                                    |
| ------------------- | ------------------------------------------------------------------------ |
| rng.test.ts         | determinismo, faixas, pesos, save/restore do estado do RNG               |
| calendar.test.ts    | datas, meses, estações, virada de ano                                    |
| crops.test.ts       | preparar/plantar/irrigar/colher, estágios, validações, capacidade diária |
| weather.test.ts     | clima por estação, previsão de 7 dias, umidade                           |
| market.test.ts      | limites de preço, variação diária, impacto de venda, histórico           |
| economy.test.ts     | compra de terra, construções, armazenagem, livro-caixa, DRE              |
| machines.test.ts    | compra, combustível, desgaste, manutenção, vagas                         |
| loans.test.ts       | Price, limite, amortização, quitação, inadimplência, falência            |
| events-tech.test.ts | eventos, tecnologias, XP/níveis, objetivos                               |
| save.test.ts        | round-trip, versão, saves corrompidos, armazenamento indisponível        |
| invariants.test.ts  | 2 anos de jogador aleatório em cada dificuldade + rajadas de 8×          |
| loop.test.ts        | integração: loop completo + save/load + determinismo + lucratividade     |

Resultado atual: **12 arquivos, 70 testes, todos passando** (~3 s).

## Teste manual / E2E

O loop foi validado em Chromium headless (Playwright) contra `npm run preview`:
menu → novo jogo → preparar → plantar → irrigar → crescer → colher → vender → comprar
trator → construir silo → empréstimo → comprar terra → salvar → recarregar → continuar
(dinheiro idêntico). Sem erros de runtime no console.
Esse script não faz parte do repositório (depende de Chromium local).
