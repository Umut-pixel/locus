#!/usr/bin/env bash
# Kök .env'den agent/.env üretir. TEK DÜZENLEME YERİ: /Users/umuterol/Desktop/locus/.env
#
# Neden kopyalıyoruz da symlink kurmuyoruz:
#   `mda deploy` proje .env'ini LangSmith'e deploy sırrı olarak yükler.
#   Symlink olsaydı SUPABASE_SERVICE_KEY, AUTH_PASSWORD, CRON_SECRET gibi
#   agent'ın işi olmayan sırlar da LangSmith'e giderdi. Agent'ın güvenlik
#   modelinin tamamı, onun service_role'a ASLA sahip olmamasına dayanıyor.
#   Bu script yalnızca aşağıdaki beyaz listeyi taşır.
set -euo pipefail

KOK="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KAYNAK="$KOK/.env"
HEDEF="$KOK/agent/.env"

[ -f "$KAYNAK" ] || { echo "HATA: $KAYNAK yok." >&2; exit 1; }

# Agent'ın görmesi gereken TEK anahtarlar.
BEYAZ_LISTE=(
  ANTHROPIC_API_KEY
  LANGSMITH_API_KEY
  # AB bolgesindeki hesaplar icin zorunlu. Yoksa mda varsayilan ABD ucuna
  # gider ve HER komut "Forbidden (HTTP 403)" verir — anahtar gecerli olsa
  # bile. 2026-08-23'te olculdu: ayni anahtar api.smith.langchain.com'da 403,
  # eu.api.smith.langchain.com'da 200.
  LANGSMITH_ENDPOINT
  LANGSMITH_WORKSPACE_ID
  AGENT_DB_URL
  LOCUS_API_BASE
  AGENT_API_SECRET
)

{
  echo "# OTOMATIK URETILDI — bu dosyayi elle duzenleme."
  echo "# Kaynak: $KAYNAK   |   Yeniden uret: agent/sync-env.sh"
  echo
  for anahtar in "${BEYAZ_LISTE[@]}"; do
    satir="$(grep -E "^${anahtar}=" "$KAYNAK" || true)"
    if [ -n "$satir" ]; then
      echo "$satir"
    else
      echo "# ${anahtar}= (kok .env'de yok)"
    fi
  done
} > "$HEDEF"

chmod 600 "$HEDEF"

echo "-> $HEDEF yazildi. Tasinan anahtarlar:"
grep -E '^[A-Z_]+=' "$HEDEF" | while IFS='=' read -r k v; do
  if [ -n "$v" ]; then echo "   $k  DOLU(${#v})"; else echo "   $k  BOS"; fi
done
eksik="$(grep -cE '^# [A-Z_]+= \(kok' "$HEDEF" || true)"
[ "$eksik" -gt 0 ] && echo "   ($eksik anahtar kok .env'de tanimli degil)" || true
