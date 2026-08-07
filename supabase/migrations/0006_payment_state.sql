-- WeeFly Concierge — fechar o pagamento
--
-- Duas realidades a conviver na mesma tabela:
--
--   1. A WeePay ainda não tem URL nem chave. Enquanto não tiver, o pagamento é
--      combinado fora da plataforma e alguém o regista à mão. O que faltava era
--      o cliente ter como dizer "já paguei" sem telefonar — daí
--      `client_declared_paid_at`.
--
--   2. Quando a WeePay entrar, a resolução de estado passa a vir dela. O manual
--      diz webhook-first (§1.2), mas o único webhook que documenta é
--      provider → WeePay; não há contrato WeePay → WeeFly. Por isso guardamos
--      também `last_checked_at`: a verificação por sondagem contra
--      GET /api/v1/payments/{txn}/status é o mecanismo que temos garantido.
--
-- Nada aqui é obrigatório. Um pagamento continua a poder nascer e morrer sem
-- que nenhuma destas colunas seja preenchida.

alter table public.case_payments
  /* O cliente carregou em "Já paguei" na página do link 3. É uma declaração,
     não uma confirmação: só o admin (ou a WeePay) move o estado para COMPLETED.
     Guardado à parte precisamente para não se confundir com prova de nada. */
  add column if not exists client_declared_paid_at timestamptz,
  /* Última vez que perguntámos o estado à WeePay. Serve para não martelar o
     gateway a cada render da página e para o back-office poder dizer há quanto
     tempo a informação é. */
  add column if not exists last_checked_at        timestamptz,
  /* A razão que a WeePay deu quando falhou. Sem isto, um FAILED no ecrã não
     diz a ninguém o que fazer a seguir. */
  add column if not exists failure_reason         text,
  /* 'card', 'mobile_money', 'transfer'… O que foi pedido à WeePay no initiate.
     Texto livre porque a lista de métodos é da WeePay e muda sem nos avisar. */
  add column if not exists method                 text;

/* O webhook chega com o id da transação da WeePay e mais nada nosso. A coluna
   já é unique — o que faltava era o índice existir de facto para o lookup, que
   o unique constraint em Postgres garante, mas só para essa coluna isolada. */
create index if not exists case_payments_weepay_txn_idx
  on public.case_payments (weepay_transaction_id)
  where weepay_transaction_id is not null;

/* Procurar o pagamento vivo de um caso é a leitura mais frequente de todas:
   acontece em cada abertura do link 3 e em cada render da ficha do caso. */
create index if not exists case_payments_case_recent_idx
  on public.case_payments (case_id, created_at desc);

notify pgrst, 'reload schema';
