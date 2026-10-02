-- ═══════════════════════════════════════════════════════════════════════════
-- WeeFly · atualização de 2 de outubro — marca de cada empresa, SEO,
-- subdomínios e o parceiro Alô
-- ═══════════════════════════════════════════════════════════════════════════
--
--   OCT-12 · o subdomínio: 2 a 30 caracteres e fora dos nomes reservados. O
--            índice único de `partners.slug` (0020) continua a ser o que
--            decide entre dois Admin a aprovar ao mesmo tempo.
--   OCT-13 · cor de destaque, ícone e imagem de partilha, ao lado do logótipo.
--   SEO-02 · título e descrição por empresa (⚠ editáveis no Admin).
--   SEO-04 · o conjunto de ícones gerado a partir do ícone (favicon.ico,
--            16/32, apple-touch-icon, 192, 512, maskable) vive numa pasta
--            versionada do bucket `brand`; `icons_base_url` aponta para ela.
--   Q5     · `custom_domain`: um domínio próprio por empresa (ex.:
--            `weefly.co.mz`). Não é usado ainda; existe para o modelo não o
--            impedir.
--   OCT-14 · o Alô Cabo Verde Tour, white label B2G, subdomínio `alo`.
--
-- As duas regras novas do slug entram `not valid`: valem para o que se
-- escrever daqui em diante e não rejeitam uma linha antiga que já exista.
--
-- Idempotente.
--
--   psql "$DATABASE_URL" -f supabase/migrations/0031_brand_assets_seo.sql
--
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── OCT-13 · SEO-02 · SEO-04 · Q5 ───────────────────────────────────────────

alter table public.partners
  add column if not exists color_accent    text,
  add column if not exists icon_url        text,
  add column if not exists icons_base_url  text,
  add column if not exists og_image_url    text,
  add column if not exists brand_version   integer not null default 1,
  add column if not exists seo_title       text,
  add column if not exists seo_description text,
  add column if not exists custom_domain   text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'partners_color_accent_hex') then
    alter table public.partners
      add constraint partners_color_accent_hex
      check (color_accent is null or color_accent ~ '^#[0-9a-fA-F]{6}$');
  end if;

  -- OCT-12 · 2 a 30, minúsculas, números e hífen, sem hífen nas pontas.
  if not exists (select 1 from pg_constraint where conname = 'partners_slug_subdomain') then
    alter table public.partners
      add constraint partners_slug_subdomain
      check (slug ~ '^[a-z0-9][a-z0-9-]{0,28}[a-z0-9]$') not valid;
  end if;

  -- OCT-12 · os endereços da própria plataforma. A mesma lista que
  -- `src/lib/subdomain.ts`.
  if not exists (select 1 from pg_constraint where conname = 'partners_slug_not_reserved') then
    alter table public.partners
      add constraint partners_slug_not_reserved
      check (slug not in ('pro', 'www', 'admin', 'api', 'mail', 'dev', 'app', 'pc', 'static', 'assets')) not valid;
  end if;
end $$;

create unique index if not exists partners_custom_domain_key
  on public.partners (lower(custom_domain)) where custom_domain is not null;

comment on column public.partners.icons_base_url is
  'SEO-04 · a pasta com favicon.ico, favicon-16x16.png, favicon-32x32.png, apple-touch-icon.png, icon-192.png, icon-512.png e icon-512-maskable.png desta empresa. Nulo: os da WeeFly.';
comment on column public.partners.brand_version is
  'SEO-04 · sobe a cada ícone novo; vai no ?v= dos links, para o browser não ficar com o antigo em cache.';

-- ── SEO-04 · o bucket da marca ──────────────────────────────────────────────
--
-- Público: são logótipos e ícones, feitos para serem vistos por qualquer
-- browser, pelo WhatsApp e pelos clientes de email. Só a service role escreve
-- (o upload passa pelo servidor, depois de verificar que é o Admin WeeFly);
-- não há política de escrita para `authenticated`.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brand', 'brand', true, 2097152,
  array['image/png', 'image/svg+xml', 'image/jpeg', 'image/x-icon', 'image/vnd.microsoft.icon', 'application/manifest+json']
)
on conflict (id) do update
  set public             = true,
      file_size_limit    = 2097152,
      allowed_mime_types = array['image/png', 'image/svg+xml', 'image/jpeg', 'image/x-icon', 'image/vnd.microsoft.icon', 'application/manifest+json'];

-- ── SEO-02 · os textos por defeito da WeeFly ────────────────────────────────

update public.partners
   set seo_title        = coalesce(seo_title, 'Encontre o melhor preço para o seu voo · WeeFly'),
       seo_description  = coalesce(seo_description, 'Peça a sua viagem à WeeFly e receba as melhores ofertas por WhatsApp e email.'),
       changed_by_email = 'migração 0031'
 where is_operator
   and (seo_title is null or seo_description is null);

-- ── OCT-14 · o Alô ──────────────────────────────────────────────────────────
--
-- Os ficheiros vieram no pacote de 2 de outubro e estão em `public/brand/alo/`.
-- Os caminhos relativos resolvem-se no endereço da plataforma (`lib/brand`).
-- ⚠ NIF, morada, remetente e WhatsApp não chegaram: ficam vazios, para
-- preencher no ecrã de Parceiros.

insert into public.partners
  (slug, commercial_name, country, status,
   supply_enabled, sell_enabled, sell_mode, channels, customer_front,
   powered_by_weefly, is_operator,
   logo_url, icon_url, icons_base_url, og_image_url,
   color_primary, color_accent,
   seo_title, seo_description, changed_by_email)
values
  ('alo', 'Alô Cabo Verde Tour', 'CV', 'active',
   false, true, 'white_label', array['B2G'], 'own',
   true, false,
   '/brand/alo/alo-logo.png', '/brand/alo/alo-icon.png', '/brand/alo', '/brand/alo/og-image.jpg',
   '#02A9FF', '#FF6A02',
   'Alô Cabo Verde Tour · Agência de viagens e turismo',
   'Peça a sua viagem à Alô Cabo Verde Tour. Passagens aéreas com o apoio da nossa equipa.',
   'migração 0031')
on conflict (slug) do update
  set logo_url        = coalesce(public.partners.logo_url, excluded.logo_url),
      icon_url        = coalesce(public.partners.icon_url, excluded.icon_url),
      icons_base_url  = coalesce(public.partners.icons_base_url, excluded.icons_base_url),
      og_image_url    = coalesce(public.partners.og_image_url, excluded.og_image_url),
      color_primary   = coalesce(public.partners.color_primary, excluded.color_primary),
      color_accent    = coalesce(public.partners.color_accent, excluded.color_accent),
      seo_title       = coalesce(public.partners.seo_title, excluded.seo_title),
      seo_description = coalesce(public.partners.seo_description, excluded.seo_description),
      changed_by_email = 'migração 0031';

commit;

notify pgrst, 'reload schema';
