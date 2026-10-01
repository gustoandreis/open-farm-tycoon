# Economia e balanceamento

Todos os números ficam em `src/data/balance.ts`. Nenhum valor de jogo é "mágico" no código
dos sistemas.

## Custos por operação

Cada operação de campo (`OPERATIONS`) tem custo de mão de obra por tile, capacidade manual por
dia e bônus por máquina. Plantar soma `seedCost` da cultura. A prévia mostra o detalhamento
(mão de obra, sementes, combustível) antes de confirmar.

## Receita

`produção = baseYield × fertilidade × condição média × saúde × tecnologia × dificuldade × região`.
A venda usa o preço do dia com desconto por profundidade de mercado (`marketDepth`), limitado a
`MARKET.maxSaleImpact` (12%), e cria pressão de oferta que se recupera 4%/dia.
Colheita que não cabe no armazém é vendida na hora a 80% do preço.

## Mercado

Preço diário = reversão à média (8%/dia) em direção a um alvo sazonal (±8%, pico no mês
`pricePeakMonth`) + ruído normal × `volatility` + efeitos de eventos, limitado a
[0,45×; 2,2×] do preço base. Teste garante variação diária ≤ ~6%.

## Custos fixos mensais

Manutenção de construções (`upkeep`), salários, manutenção de máquinas (proporcional), juros.

## Crédito

- Limite = 30k + 50% dos ativos (terra + construções + máquinas) + 5k/nível (+25% com
  escritório) − dívida atual.
- Juros anuais por dificuldade: 8% / 12% / 18% (escritório −2 p.p.). Parcela pela tabela Price.
- Amortização antecipada recalcula a parcela mantendo o prazo.

## Referências de balanceamento (Normal)

- Início com $45.000, lote 8×8 e sede (60 t de armazenagem).
- Um ciclo de soja em 12 tiles custa ≈ $3.100 e rende ≈ $5.600–6.600 (teste manual).
- Teste de integração (`tests/loop.test.ts`) roda uma safra de soja completa no Normal
  (preparar → plantar → crescer → colher → vender) e verifica lucro positivo.

## Invariantes (testadas)

Dinheiro finito; estoque ≥ 0; estoque ≤ capacidade; preços > 0 e finitos; saldo de
empréstimo ≥ 0; umidade 0–100; progresso ≤ ciclo; condição de máquinas 0–100; datas válidas.
