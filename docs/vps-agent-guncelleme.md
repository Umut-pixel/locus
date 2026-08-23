# VPS agent güncelleme — konuşma geçmişi

Frontend’i (Vercel) yayınlamadan **önce** bu adımları bitir. Aksi halde
kenar çubuğundaki Konuşmalar 500 verir veya ajan eski binary ile ayağa
kalkar (`konusma_gecmisi` aracı yüklenmez).

Bu iş **üç yer** dokunur. Karıştırma:

| Nerede | Ne | Bu işte |
|---|---|---|
| **Supabase** (SQL Editor) | Tablolar + `locus_agent_ro` SELECT | Evet — 1. adım |
| **VPS** (LangGraph) | Agent kodu + süreç restart | Evet — 3. adım |
| **Vercel** (Next.js) | Frontend + `/api/agent` proxy | En son |

VPS’te Next.js **yok**. Orada yalnız LangGraph çalışır. SQL de VPS’te
çalıştırılmaz; Postgres Supabase’te.

Yeni ortam değişkeni **yok**. `AGENT_DB_URL` zaten duruyorsa dokunma.
`AGENT_URL` / `AGENT_INGRESS_SECRET` / `ASSISTANT_ID` aynı kalsın.

---

## Sıra

1. Supabase SQL (bu dosyadaki §1)
2. Git push (sen yapıyorsun)
3. VPS: pull + LangGraph restart (§2–§4)
4. Doğrulama (§5)
5. Vercel frontend publish

---

## 1. Supabase — tablolar (bir kez)

SQL Editor’de **yalnız** şunu çalıştır:

```
sql/agent_konusmalar.sql
```

Ne yapar: `agent_konusmalar` + `agent_konusma_mesajlari` oluşturur, RLS
açar, `anon`/`authenticated` yetkisini keser, `locus_agent_ro`’ya SELECT
+ policy verir.

Daha önce uyguladıysan tekrar çalıştırmak zararsız (`if not exists` /
`drop policy if exists`).

**Çalıştırma.** `sql/agent_readonly_role.sql` dosyasının tamamını yeniden
çalıştırma. İçinde parola placeholder’ı var; tüm grant’ları `revoke all`
ile sıfırlar. Bu güncelleme için gerekmez — konuşma tablolarının grant’ı
`agent_konusmalar.sql` içinde.

### Doğrulama (SQL Editor)

```sql
select to_regclass('public.agent_konusmalar')              as konusmalar;
select to_regclass('public.agent_konusma_mesajlari')       as mesajlar;

select has_table_privilege('locus_agent_ro', 'public.agent_konusmalar', 'select')        as ro_konusma;
select has_table_privilege('locus_agent_ro', 'public.agent_konusma_mesajlari', 'select') as ro_mesaj;
```

Dört satır da dolu / `true` olmalı. `ro_*` false ise grant uygulanmamış
demektir — `agent_konusmalar.sql`’i tekrar çalıştır.

---

## 2. VPS’e hangi dosyalar gider

Repo pull’u bunları getirir. Elle scp etme.

```
agent/agent.py                         # konusma_gecmisi kayıtlı
agent/instructions.md                  # hafıza katmanı 2
agent/semantic/veri_kaynaklari.md      # §9 sohbet tabloları
agent/tools/konusma_gecmisi.py         # YENİ araç
agent/tools/sql_guard.py               # ALLOWED_RELATIONS +2 tablo
agent/tools/sql_query.py               # docstring
agent/evals/test_sql_guard.py          # konusma-liste allow
```

Yeni pip paketi yok (`psycopg` zaten var). `uv sync` / `pip install`
şart değil.

---

## 3. VPS — kodu çek

SSH ile bağlan. Repo dizini sende farklıysa `cd` yolunu düzelt.

```bash
# sürecin nereden çalıştığını gör
ps aux | grep -E 'langgraph|uv run' | grep -v grep
```

Çıktıdaki `cwd` / komut satırı repo kökünü söyler. Tipik:

```bash
cd /path/to/petshop_etl          # VPS'teki clone
git fetch origin
git status
git pull origin <dal>            # push'ladığın dal: main / master / vs.
```

Pull’dan sonra yeni dosya duruyor mu:

```bash
test -f agent/tools/konusma_gecmisi.py && echo OK || echo EKSIK
grep -n konusma_gecmisi agent/agent.py
```

`OK` ve `agent.py` içinde import görünmeli.

`AGENT_DB_URL` hâlâ `locus_agent` (read-only) olmalı. service_role /
postgres **koyma**.

```bash
# değer basma; yalnız tanımlı mı bak
grep -E '^AGENT_DB_URL=' agent/.env .env 2>/dev/null | sed 's/=.*/=***/'
```

---

## 4. VPS — LangGraph’ı yeniden başlat

Eski süreç bellekte eski `agent.py`’yi tutar. Restart olmadan yeni araç
yüklenmez. Frontend yayınlansa bile ajan “daha önce konuşmuştuk” için
SQL’e düşer veya geçmişi görmez.

### systemd ise

```bash
systemctl list-units --type=service --all | grep -iE 'langgraph|locus|agent'
sudo systemctl restart <birim-adi>
sudo systemctl status <birim-adi> --no-pager
```

### systemd değilse (tmux / screen / nohup)

Çalışan süreci durdur, aynı komutla tekrar aç. `agent/README.md` ile
uyumlu komut:

```bash
# eski
pkill -f 'langgraph dev' || true
# gerekirse: pkill -f 'langgraph.json'

cd /path/to/petshop_etl/agent
# senin kurulum hangisiyse onu kullan — ikisinden biri:
uv run langgraph dev --no-browser --port 2024 --allow-blocking
# veya:
langgraph dev --no-browser --port 2024 --allow-blocking
```

`--allow-blocking` zorunlu; yoksa senkron SQL `BlockingError` verir.

Port 2024 dışarı açıksa (firewall / nginx) aynı kalsın. Yeni port açma.

Log’da graph adı `locus-analyst` görünmeli. Vercel `ASSISTANT_ID` bununla
aynı olmalı (varsayılan `locus-analyst`). Değiştirme.

---

## 5. Doğrulama (frontend’den önce)

VPS’ten:

```bash
ss -tlnp | grep 2024
# veya: curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:2024/ok
```

Dışarıdan (laptop, Vercel’in vurduğu URL):

```bash
curl -sS -o /tmp/agent-headers.txt -D - \
  -H "x-agent-secret: $AGENT_INGRESS_SECRET" \
  http://<VPS-HOST>:2024/ok
```

`401` → sır yanlış veya header adı farklı (`x-agent-secret`).
Bağlantı reddi → süreç yok / firewall.
Timeout → LangGraph ayakta değil.

İsteğe bağlı, agent dizininde:

```bash
cd /path/to/petshop_etl/agent
uv run python evals/test_sql_guard.py
```

`konusma-liste` allow edilmeli.

---

## 6. Sonra frontend (Vercel)

VPS yeşil olduktan sonra yayınla.

Vercel env’e **yeni değişken ekleme.** Kontrol et, değiştirme:

| Değişken | Beklenen |
|---|---|
| `AGENT_URL` | `http://<VPS>:2024/runs/stream` (veya nginx arkasındaki aynı path) |
| `AGENT_INGRESS_SECRET` | VPS `agent/.env` ile **aynı** |
| `ASSISTANT_ID` | yoksa default `locus-analyst`; VPS graph adı ile aynı |
| `SUPABASE_SERVICE_KEY` | konuşma yazımı API route’undan; zaten duruyor olmalı |

Publish sonrası uygulama içi:

1. `/home` → boş sohbet, `+` / `@` menüsü **aşağı** açılır.
2. Bir soru gönder → kenar çubuğunda konuşma belirir, URL `?k=<uuid>`.
3. Başka konuşmaya tıkla → tam metin gelir.
4. “Daha önce baktığımız …” de → ajan `konusma_gecmisi` kullanabilir
   (LangGraph log’unda tool adı görünür).

---

## Ters gidenler

| Belirti | Muhtemel neden | Ne yap |
|---|---|---|
| Kenar çubuğu boş, Network’te `/api/agent/konusmalar` 500 | SQL uygulanmadı | §1 |
| Sohbet kaydolur, ajan “bağlanılamadı” | VPS süreci yok / `AGENT_URL` yanlış | §4, Vercel env |
| Ajan cevaplar ama geçmişi hatırlamaz | Restart olmadı, eski kod | §4 |
| `YETKİ HATASI` / empty result geçmişte | `locus_agent_ro` SELECT yok | §1 doğrulama |
| `ASSISTANT_ID` / 422 assistant not found | Graph adı ≠ env | `langgraph.json` `graphs` anahtarı |

---

## Bu işin parçası olmayan dirty dosyalar

Working copy’de harita, login, panorama, bento/chart vs. duruyor olabilir.
Konuşma geçmişi + ajan için **gerekmez**. VPS’e onları çekmek zorunda değilsin;
bu güncelleme yalnız yukarıdaki `agent/` dosyaları + SQL.
