-- ═══════════════════════════════════════════════════════════════════════════
-- WeeFly · IMG-01 — a biblioteca de imagens das cidades
-- ═══════════════════════════════════════════════════════════════════════════
--
-- "Uma biblioteca de imagens por cidade, gerida pelo master no Admin:
-- carregar, substituir e desativar. Cada imagem ligada a um código de cidade
-- ou de aeroporto: RAI, LIS, PAR. Um aeroporto usa a imagem da sua cidade:
-- CDG e ORY usam a de Paris."
--
--   · `code`          · o código da cidade (`PAR`, `LON`, `NYC`) ou, numa
--                       cidade de um só aeroporto, o do aeroporto (`RAI`).
--   · `airport_codes` · os aeroportos que usam esta imagem. É uma coluna e
--                       não uma lista no código para o master a poder corrigir
--                       no Admin, sem deploy.
--   · `image_large`   · WebP 1600 × 1200, abaixo de 200 KB (bucket público
--                       `brand`, pasta `cities/`).
--   · `image_small`   · WebP 800 × 600, para telemóveis.
--   · `placeholder`   · a imagem em 32 × 24, em data URL: é o que aparece
--                       primeiro, sem pedido nenhum.
--   · `active`        · desativar não apaga: a cidade volta ao fundo da marca.
--
-- Sem imagem (as três colunas nulas) a linha continua a servir: dá o nome da
-- cidade ao fundo da marca. As 33 primeiras cidades entram assim, à espera
-- das imagens do Ivandro.
--
-- Leitura e escrita só pela service role (a rota pública e a server action do
-- Admin WeeFly). RLS ligado, sem políticas — como a escrita de `airlines`.
--
-- Idempotente.
--
--   psql "$DATABASE_URL" -f supabase/migrations/0044_city_images.sql
--
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.city_images (
  code              text primary key,
  city_name         text not null,
  airport_codes     text[] not null default '{}',
  alt               text,
  image_large       text,
  image_small       text,
  placeholder       text,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  changed_by_email  text,
  constraint city_images_code_check  check (code ~ '^[A-Z]{3}$'),
  constraint city_images_name_check  check (char_length(btrim(city_name)) between 2 and 80),
  constraint city_images_alt_check   check (alt is null or char_length(alt) <= 160),
  -- As duas versões servidas sobem juntas, ou nenhuma.
  constraint city_images_pair_check  check ((image_large is null) = (image_small is null))
);

create index if not exists city_images_airports_idx on public.city_images using gin (airport_codes);

comment on table public.city_images is
  'IMG-01 · imagens das cidades (app VIP). Um aeroporto usa a imagem da cidade que o tem em airport_codes. Sem imagem, a linha dá só o nome ao fundo da marca.';

alter table public.city_images enable row level security;
revoke all on public.city_images from anon, authenticated;

-- ── as primeiras 33 cidades ─────────────────────────────────────────────────
-- Cabo Verde, uma cidade em cada país dos 20 parceiros, e as rotas da
-- diáspora. `on conflict do nothing`: correr outra vez não desfaz o que o
-- master já mudou.

insert into public.city_images (code, city_name, airport_codes) values
  -- Cabo Verde
  ('RAI', 'Praia',        '{RAI}'),
  ('SID', 'Sal',          '{SID}'),
  ('VXE', 'Mindelo',      '{VXE}'),
  ('BVC', 'Boa Vista',    '{BVC}'),
  -- Europa e Américas
  ('LIS', 'Lisboa',       '{LIS}'),
  ('OPO', 'Porto',        '{OPO}'),
  ('PAR', 'Paris',        '{CDG,ORY,BVA,LBG}'),
  ('MAD', 'Madrid',       '{MAD}'),
  ('LON', 'Londres',      '{LHR,LGW,STN,LTN,LCY,SEN}'),
  ('RTM', 'Roterdão',     '{RTM}'),
  ('AMS', 'Amesterdão',   '{AMS}'),
  ('BOS', 'Boston',       '{BOS}'),
  ('NYC', 'Nova Iorque',  '{JFK,EWR,LGA}'),
  ('FOR', 'Fortaleza',    '{FOR}'),
  -- África · os países dos parceiros
  ('LAD', 'Luanda',       '{LAD,NBJ}'),
  ('DLA', 'Douala',       '{DLA}'),
  ('FIH', 'Kinshasa',     '{FIH,NLO}'),
  ('ACC', 'Accra',        '{ACC}'),
  ('CKY', 'Conacri',      '{CKY}'),
  ('OXB', 'Bissau',       '{OXB}'),
  ('ABJ', 'Abidjan',      '{ABJ}'),
  ('NBO', 'Nairobi',      '{NBO,WIL}'),
  ('BKO', 'Bamako',       '{BKO}'),
  ('CAS', 'Casablanca',   '{CMN}'),
  ('MPM', 'Maputo',       '{MPM}'),
  ('LOS', 'Lagos',        '{LOS}'),
  ('TMS', 'São Tomé',     '{TMS}'),
  ('DKR', 'Dakar',        '{DSS,DKR}'),
  ('FNA', 'Freetown',     '{FNA}'),
  ('JNB', 'Joanesburgo',  '{JNB,HLA}'),
  ('LFW', 'Lomé',         '{LFW}'),
  ('TUN', 'Tunes',        '{TUN}'),
  ('LUN', 'Lusaka',       '{LUN}')
on conflict (code) do nothing;

commit;

notify pgrst, 'reload schema';
