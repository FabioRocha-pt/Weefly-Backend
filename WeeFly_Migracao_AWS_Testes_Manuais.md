# Testes feitos à mão no servidor novo

| | |
|---|---|
| Aplicação | WeeFly Concierge + Price Checker |
| Endereço | `https://concierge.weefly.africa` |
| Data | 26 de Setembro de 2026 |
| Para | Ivandro |
| De | Fábio Rocha |
| Tempo | Cerca de 20 minutos |

## Para que serve

O site já está a correr no servidor novo da AWS e passou nos testes
automáticos. Faltam os testes que precisam de uma pessoa: entrar com uma conta
real e percorrer um pedido do princípio ao fim, como um cliente.

Não é preciso saber nada do servidor. Se alguma coisa correr mal, anota o que
apareceu no ecrã, com uma captura, e a hora.

## Antes de começar

- Usa o **Chrome ou o Edge numa janela anónima**. Assim não há sessões antigas a interferir.
- Tem à mão o **email e a password da tua conta do back-office**.
- Tem à mão um **ficheiro para servir de comprovativo**: uma foto ou um PDF qualquer, com menos de 8 MB.
- No pedido de teste, usa **o teu email** e o nome **TESTE MIGRAÇÃO**, para receberes os avisos e não se confundir com um cliente real.

## Teste 1 · Entrar no back-office

- **1.** Abre `https://concierge.weefly.africa/login`.
- **2.** Escreve o teu email e a password e carrega em entrar.
- **3.** Depois, abre `https://concierge.weefly.africa/admin/price-checker`.

**Está certo se:** entras sem erros e, no segundo endereço, vês a fila de
pedidos do Price Checker.

**Está errado se:** voltas ao ecrã de login sem mensagem nenhuma, se aparece
uma página a dizer que a tua conta não está na lista, ou se aparece um erro.

## Teste 2 · Um pedido do princípio ao fim, com comprovativo

Este teste passa pelo lado do cliente e pelo lado do back-office. Mantém o
back-office aberto numa aba e usa outra para o cliente.

**Lado do cliente**

- **1.** Abre `https://concierge.weefly.africa/pc`.
- **2.** Preenche um pedido de viagem qualquer: nome **TESTE MIGRAÇÃO**, com o teu email. Carrega em **Enviar pedido**.
- **3.** Tens de ver o ecrã que diz que estamos a procurar opções. Guarda o endereço desta página. É o link do cliente (`/pc/…`).

**Lado do back-office**

- **4.** Em `/admin/price-checker`, o pedido tem de aparecer na fila. Abre-o.
- **5.** Na aba **Ofertas**, compõe uma proposta com uma opção, com um preço qualquer, e carrega em **Publicar e avisar cliente**.
- **6.** Confirma que chega ao teu email o aviso de que há opções.

**De novo no lado do cliente**

- **7.** Abre o link do cliente e carrega em **Escolher esta opção**.
- **8.** Em **Quem viaja?**, preenche os dados de um passageiro e carrega em **Continuar para o pagamento**.
- **9.** No ecrã de pagamento, anexa o ficheiro de teste e envia-o.
- **10.** Tens de ver **Comprovativo recebido — estamos a verificar**.

**De novo no back-office**

- **11.** Abre o caso. O comprovativo tem de aparecer e tem de abrir quando carregas nele.
- **12.** Para arrumar: carrega em **Rejeitar comprovativo**, com o motivo "teste da migração", e depois em **Fechar o link agora**.

**Não marques a caixa de pagamento recebido.** Essa caixa dá o caso como pago e
avisa o cliente por email. Num teste, o que queremos é rejeitar o comprovativo e
fechar o link.

## Resultado

| Teste | Correu bem? | Notas |
|---|---|---|
| 1 · Entrar no back-office | ☐ Sim ☐ Não | |
| 2 · Pedido enviado e visível na fila | ☐ Sim ☐ Não | |
| 2 · Email de opções recebido | ☐ Sim ☐ Não | |
| 2 · Comprovativo enviado | ☐ Sim ☐ Não | |
| 2 · Comprovativo abre no back-office | ☐ Sim ☐ Não | |
| 2 · Link do cliente fechado no fim | ☐ Sim ☐ Não | |

Envia-me esta tabela preenchida, ou uma mensagem com o que falhou, a hora e uma
captura. Com a hora encontro o erro nos registos do servidor.
