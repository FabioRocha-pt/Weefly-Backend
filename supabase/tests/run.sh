#!/usr/bin/env bash
# Corre todas as migrações num Postgres descartável e depois os testes de RLS.
#
#   bash supabase/tests/run.sh
#
# Precisa do Docker. Não toca na base real: o contentor nasce e morre aqui.
# Serve para provar uma migração ANTES de ela ir para o SQL Editor do
# Supabase — em particular o isolamento entre parceiros do TEN-03, que não se
# consegue provar de outra forma sem criar contas de teste em produção.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS="$HERE/../migrations"
NAME="weefly-rls-test-$$"
IMAGE="${PG_IMAGE:-postgres:15-alpine}"

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$NAME" -e POSTGRES_PASSWORD=test "$IMAGE" >/dev/null

for _ in $(seq 1 30); do
  docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
# O pg_isready responde antes de o init acabar; esperar pela segunda subida.
sleep 2

psql_file() {
  docker exec -i "$NAME" psql -U postgres -d postgres \
    -v ON_ERROR_STOP=1 -q -X --set=client_min_messages=warning < "$1"
}

echo "· stub do Supabase"
psql_file "$HERE/_supabase_stub.sql"

for f in "$MIGRATIONS"/0*.sql; do
  echo "· $(basename "$f")"
  psql_file "$f"
done

# Segunda passagem da última migração: prova que é idempotente.
last="$(ls "$MIGRATIONS"/0*.sql | tail -1)"
echo "· $(basename "$last") (outra vez)"
psql_file "$last"

for t in "$HERE"/test_*.sql; do
  echo "· $(basename "$t")"
  psql_file "$t" notice
done

echo "OK"
