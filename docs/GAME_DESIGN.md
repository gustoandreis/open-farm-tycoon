# Game design

## Fantasia

Administrar uma fazenda brasileira: decidir **o que** plantar, **quando** vender e **como**
crescer sem quebrar o caixa.

## Loop principal

Comprar/usar terra → preparar → plantar → (irrigar) → crescer (clima, solo) → colher →
armazenar → vender no melhor momento → reinvestir (terra, máquinas, construções, pessoas,
tecnologia).

## Mapa

64×64 tiles, dividido em lotes 8×8. O jogador começa com o lote central e a sede.
Lotes vizinhos aos já possuídos podem ser comprados; preço varia com floresta/água.
Floresta custa mais para preparar (desmatamento).

## Culturas

| Cultura  | Dias | Produção base (t/tile) | Preço base ($/t) | Destaque                                  |
| -------- | ---- | ---------------------- | ---------------- | ----------------------------------------- |
| Milho    | 32   | 7,5                    | 80               | volume alto, preço baixo                  |
| Soja     | 28   | 3,0                    | 185              | equilibrada                               |
| Trigo    | 26   | 3,2                    | 132              | tolera inverno                            |
| Batata   | 24   | 25                     | 38               | nível 2+, muito volume, exige armazenagem |
| Girassol | 22   | 2,2                    | 255              | nível 3+, alto valor                      |

Estágios: semente → broto → inicial → médio → maduro → pronto. Colheita atrasada (> 15 dias)
causa perdas.

## Tempo e clima

Mês de 30 dias, ano de 360. Estações do hemisfério sul. Velocidades: pausa, 1×, 2×, 4×, 8×.
8 tipos de clima (ensolarado, nublado, chuva, chuva forte, calor, seca, frio, tempestade) com
previsão de 7 dias cuja precisão cai com a distância.

## Solo

Fertilidade (cai a cada colheita, recupera em pousio), umidade (clima, irrigação, evaporação)
e saúde do solo. Modos de visão "Umidade" e "Fertilidade".

## Sistemas de gestão

- **Máquinas**: trator, plantadeira, colheitadeira, pulverizador. Aumentam a capacidade diária
  e reduzem custo de mão de obra; consomem combustível e desgastam (manutenção/oficina).
- **Construções**: silo (+450 t), galpão (vagas de máquinas), oficina (manutenção mais barata),
  escritório (crédito/juros/vagas de funcionários), estação de irrigação (irriga automaticamente).
- **Funcionários**: candidatos com habilidade e salário; reduzem custo de campo, irrigam e
  conservam máquinas.
- **Mercado**: preço com reversão à média, sazonalidade, volatilidade, eventos e impacto de
  venda grande. Histórico de 60 dias com gráfico.
- **Finanças**: livro-caixa, resumo mensal, DRE anual, patrimônio.
- **Banco**: empréstimos Price (12/24/36 meses), limite por patrimônio e nível, amortização
  antecipada e quitação.
- **Falência**: caixa negativo → alerta → inadimplência → recuperação ou falência (tela de fim).
- **Eventos**: 12 eventos (pragas, geada, alta de preços, subsídio...).
- **Progressão**: XP/níveis desbloqueiam culturas/máquinas/construções; 6 tecnologias;
  9 objetivos encadeados; 8 conquistas; resumo anual.

## Dificuldades

Fácil ($70k), Normal ($45k), Difícil ($28k) — também alteram juros, produção, eventos e
tolerância de inadimplência.

## Regiões

Paraná, Rio Grande do Sul, Mato Grosso e Goiás: modificadores de clima e produtividade.
