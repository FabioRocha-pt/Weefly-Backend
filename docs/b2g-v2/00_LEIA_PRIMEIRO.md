# WeeFly · Pacote para o Fábio

**De:** Ivandro · **Conteúdo:** o B2G dos ministérios, o terminal de vendas com três menus, a área do master, e a preparação dos testes.

## Por esta ordem

| # | Ficheiro | Para quê |
|---|---|---|
| 1 | `WeeFly_B2G_Ministerios_v2.md` | **O que construir.** 26 requisitos, cada um com critérios de aceitação e o teste que o confirma. Começa pela tabela *O que mudou desde a versão 1* e pelos pré-requisitos |
| 2 | `PREPARAR_TESTES.md` | **O que preparar para os testes.** A limpeza da base de dados, com as regras de segurança, e as contas a criar |
| 3 | `weefly_test_fixtures.json` | **Os dados de teste**, para gerares o script de criação sobre o esquema real |
| 4 | `WeeFly_Teste_por_Persona_B2G.md` | **Como o Ivandro vai testar.** Seis personas e as nove ligações entre elas. Serve para saberes o que vai ser verificado |
| | `assets/ministerios/` | Os logótipos dos três ministérios: horizontal para o cabeçalho, brasão para o ícone |

## Antes de começar

**Os pré-requisitos vêm primeiro.** O B2G não funciona sem os quatro P0 da entrada (`OCT-01` a `OCT-04`), sem o isolamento entre empresas (`TEN-03`) e sem o certificado para `*.weefly.africa`. Estão na secção *Pré-requisitos* da especificação.

**A limpeza é feita em produção.** Cópia de segurança antes, e a lista do que vai ser apagado enviada ao Ivandro antes de apagar. As regras estão no `PREPARAR_TESTES.md`.

**Há decisões por confirmar.** A especificação assume as propostas da tabela *Propostas, por confirmar*. Se alguma mudar, só muda o requisito indicado ao lado.
