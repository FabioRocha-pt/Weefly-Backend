# Correções Concierge · teste WF-2610-0078

**Para:** Fábio · **De:** Ivandro Ribeiro · **Data:** 19 out 2026
**Origem:** teste de hoje com o Dominik (caso WF-2610-0078, LIS → RAI)
**Anexo:** `bilhete-weefly-v2.pdf` (bilhete final, dados de exemplo)

Itens por ordem de prioridade.

---

## 1. Enviar o bilhete por WhatsApp (urgente)

Toda a operação passa por WhatsApp e, neste momento, o bilhete só existe em PDF, sem link para partilhar. É preciso um sítio onde o agente vê o PDF do bilhete e, a partir daí, o envia ao cliente. Esse sítio é o último bloco do separador de emissão, onde hoje estão "Abrir o bilhete" e "Reenviar ao cliente".

Bloco final, por esta ordem:

1. **Enviar por WhatsApp** (botão principal, o único laranja do bloco). Abre o `wa.me` com o número do cliente, a mensagem e o link do PDF já preenchidos.
2. **Abrir o bilhete**. Mostra o PDF.
3. **Copiar link do bilhete**. Link público com token, que abre o PDF sem login.
4. **Reenviar por email**. É o atual "Reenviar ao cliente", com o nome mudado para o canal ficar claro.

Notas:

- Se o cliente não tiver telefone, o botão de WhatsApp fica desativado com a indicação "Sem telefone do cliente. Adicione um número no pedido."
- Cada envio fica registado em Comunicações.
- Fase seguinte: ligar o número WhatsApp Business ao sistema para o envio ser automático, com o PDF como documento. Passo-te as instruções à parte.

## 2. Email de bilhete emitido para a equipa

O Dominik recebe os emails internos de todos os eventos (pedido novo, proposta enviada, cliente diz que pagou), menos o do bilhete emitido. O cliente recebe, isso já testei.

- Criar a notificação interna "Bilhete emitido · nome · WF-xxxx" para a caixa da equipa, igual às outras, com o PDF em anexo.
- Dispara uma vez, no momento da emissão. O reenvio ao cliente não gera novo email interno.
- Confirmar no log que o email ao cliente saiu neste caso.

## 3. Construtor de bilhete: campos difíceis de perceber

O Dominik não sabe o que preencher em vários campos.

- Pôr texto de ajuda em todos os campos, como já existe no "Localizador da companhia". Ex.: NVB "Não válido antes de: o bilhete não pode ser usado antes desta data". NVA "Não válido depois de: o bilhete não pode ser usado depois desta data".
- NVB e NVA são por trecho, não por bilhete.
- Pré-preencher com os dados da oferta escolhida (companhia, tarifa, datas, horas, preço). O agente só confirma e completa o que falta.
- Validação: avisar quando a data do voo fica fora do intervalo NVB/NVA. No teste ficou NVA 12SEP26 com chegada a 29/10/2026, e a proposta tinha partida a 22/10/2026.
- Marcar de forma clara os campos obrigatórios.

## 4. Preço: tirar "Serviço WeeFly"

O cliente não deve ver a taxa de serviço em separado. Mostrar sempre preço + taxas, como no ecrã "Total to pay" (390,00 € + 20,00 € taxes), que está correto.

- Corrigir no cartão "Recommended", que ainda mostra "WeeFly service 20.00 €".
- Corrigir no cartão da oferta no admin ("Serviço WeeFly € 20,00").
- Verificar o mesmo texto nos emails e no PDF do bilhete.

## 5. Bilhete final (layout v2)

O PDF servido em "Abrir o bilhete" e enviado ao cliente passa a ser o do anexo `bilhete-weefly-v2.pdf`. Os dados do anexo são de exemplo; o layout é o final.

**Página 1 · o que o passageiro precisa no balcão**

- Faixa Ember no topo, logo de quem vendeu, "Bilhete eletrónico", localizador grande em Ember, data e hora de emissão.
- Resumo: rota com cidades em português (Lisboa, não Lisbon), ida e volta, datas, número de passageiros ("2 passageiros"), número do pedido, bloco "Viaja com" com o logo da companhia e QR para a página do cliente.
- Um cartão por trecho: IDA ou VOLTA, dia e data, número do voo, cabine e classe, logo da companhia à esquerda, horas, códigos IATA, terminal quando existe, duração e escalas. Uma linha por passageiro com bilhete, lugar e bagagem.
- Tabela de passageiros: nome como no passaporte, tipo, passaporte, número de bilhete.
- Tarifa: nome, reembolso, alterações, base tarifária por sentido e linha de endossos.

**Página 2 · antes de viajar**

Bagagem por passageiro e por trecho, check-in, documentos, véspera, o que tratamos, bloco de contacto com QR e avisos legais.

**Regras**

- Fontes: Plus Jakarta Sans no texto, Roboto Mono em códigos, horas e números de bilhete.
- Cores: Ember `#EE5128`, Ember suave `#FDEEE9`, Ink `#1E2532`, Chalk `#F1F5F9`.
- Cada trecho mostra o logo da sua companhia, pelo código IATA. Sem logo, mostra um bloco com o código de duas letras e o nome. Nunca fica vazio.
- Nomes nunca são cortados. Nomes longos passam para a segunda linha.
- Duração calculada com o fuso de cada aeroporto (LIS 14:00 → RAI 16:10 dá 4h 10m, não 2h 10m).
- Setas desenhadas em SVG, não com caracteres da fonte.
- Marca de quem vendeu o caso: WeeFly Global e WeeFly Moçambique com logo WeeFly; parceiros (Alô) com o cabeçalho do parceiro e "Powered by WeeFly" no rodapé da última página.
- Bloco de contacto com o email e o WhatsApp de quem vendeu. Sem WhatsApp configurado, o item não aparece.

**Dados a corrigir no caso atual**

- Trecho de volta sem companhia (aparece "—" e sem logo).
- Bilhete TAP a começar por `056`. TAP é `047`. A emissão deve bloquear um prefixo que não seja da companhia emissora.
- Bagagem a aparecer "—" quando a oferta tinha bagagem.
- "Lugar por atribuir" sobreposto à linha divisória.

**Para dar como feito**

- Ida e volta com 2 passageiros cabe em exatamente 2 páginas A4.
- Todos os trechos mostram logo, nome da companhia e número do voo.
- Um nome de 45 caracteres aparece completo nas duas páginas.
- Duração LIS–RAI correta nos dois sentidos, incluindo a mudança de hora de outubro.
- Cidades em português e datas no formato "22 out 2026".
- Caso vendido pela Alô sai com o cabeçalho da Alô e "Powered by WeeFly". Caso vendido pela WeeFly sai só com o logo WeeFly.

---

## Já resolvido, só confirmar

- 502 Bad Gateway ao clicar em "Abrir o caso" com sessão iniciada.
