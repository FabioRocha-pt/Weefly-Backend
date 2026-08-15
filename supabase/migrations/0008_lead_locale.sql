-- WeeFly Concierge — a língua do cliente
--
-- Metade dos emails que mandamos ao cliente não sai no seguimento de um pedido
-- dele: a proposta é composta pelo agente horas depois, e a confirmação de
-- pagamento sai quando alguém vê o dinheiro entrar. Nesses dois momentos o
-- browser do cliente não está em lado nenhum — não há cookie, não há
-- Accept-Language, não há nada. O idioma tem de ter ficado guardado quando ele
-- falou connosco, ou o francês do Dakar recebe a proposta em português.
--
-- Fica no lead e não no pedido de viagem porque é uma propriedade da pessoa,
-- não da viagem: quem escreve em francês hoje escreve em francês no pedido
-- seguinte. É por isso que o `upsertLead` a actualiza a cada submissão — vale
-- sempre a língua mais recente em que a pessoa falou connosco.

alter table public.leads
  add column if not exists locale text not null default 'pt';

-- Os três idiomas de `src/i18n/config.ts`. O `default 'pt'` acima trata das
-- linhas que já existem: foram todas criadas quando o site só falava português,
-- e é essa a língua em que essas pessoas foram atendidas.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leads_locale_check'
  ) then
    alter table public.leads
      add constraint leads_locale_check check (locale in ('pt', 'en', 'fr'));
  end if;
end $$;

comment on column public.leads.locale is
  'Idioma em que o cliente falou connosco. Usado pelos emails diferidos '
  '(proposta publicada, pagamento confirmado), que saem sem pedido HTTP dele.';
