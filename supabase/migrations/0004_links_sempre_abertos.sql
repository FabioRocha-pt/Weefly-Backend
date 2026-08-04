-- WeeFly Concierge — os três links passam a nascer abertos
--
-- O desenho original bloqueava as etapas 2 e 3 até o admin as desbloquear, na
-- ideia de que a pesquisa de tarifa e o acordo com o cliente aconteciam fora da
-- plataforma e o link só devia abrir depois disso.
--
-- Na prática o envio de email ainda não está ligado, portanto o admin não tem
-- como avisar o cliente de que uma etapa abriu. Um link bloqueado passa a ser
-- só um beco sem saída. Até haver notificação automática, os três endereços
-- ficam disponíveis desde a criação e é o vendedor que decide qual partilha.
--
-- O vocabulário de estados fica intacto: `case_links.status` continua a saber
-- distinguir 'bloqueado', e `unlockStage` continua a funcionar. O que muda é o
-- ponto de partida. Para voltar ao comportamento anterior basta repor os
-- valores 'bloqueado' no seed abaixo.

-- Novos casos ---------------------------------------------------------------

create or replace function public.seed_case_links()
returns trigger
language plpgsql
as $$
begin
  insert into public.case_links (case_id, stage, status, unlocked_at)
  values
    (new.id, 1, 'ativo', now()),
    (new.id, 2, 'ativo', now()),
    (new.id, 3, 'ativo', now());
  return new;
end;
$$;

-- Casos que já existem ------------------------------------------------------
-- Só toca no que está 'bloqueado': 'submetido' e 'expirado' são estados que o
-- cliente ou o tempo já produziram e não devem ser revertidos.

update public.case_links
   set status = 'ativo',
       unlocked_at = coalesce(unlocked_at, now())
 where status = 'bloqueado';

-- Casos parados em 'novo' apenas porque a etapa 2 nunca foi aberta passam a
-- refletir que o cliente pode agora avançar sozinho.
update public.booking_cases
   set stage = 'detalhes_pendentes'
 where stage = 'novo'
   and trip_request_id is not null;

notify pgrst, 'reload schema';
