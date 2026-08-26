# Locus Agent

OSS LangGraph + deepagents üzerine kurulu operasyon asistanı. Supabase'e
salt-okunur SQL yazarak ciro / risk / sevkiyat / stok sorularını yanıtlar.

MDA (Managed Deep Agents) ve LangSmith barındırmasından çıkıldı: lisans
Plus/Enterprise istiyordu, alınmayacak bir ürün kararıydı; üstüne her istek
LangSmith API'sine gidip anahtar doğruluyordu. Geriye MIT lisanslı
`langgraph` + `langchain` + `deepagents` kaldı — agent kendi sunucusunda,
dış servise çıkmadan çalışır. `mda` CLI'ı artık gerekmez.

**Model:** `anthropic:claude-opus-5` (ana) + `anthropic:claude-haiku-4-5` (alt görev)

## Güvenlik modeli

Üç bağımsız katman — üstteki delinse bile alttaki tutar:

| # | Katman | Nerede | Ne yapar |
|---|---|---|---|
| 1 | **DB rolü** | `sql/agent_readonly_role.sql` | `locus_agent_ro` — read-only transaction, 10sn timeout, dar grant listesi. **Asıl sınır, atlatılamaz.** |
| 2 | SQL validator | `tools/sql_guard.py` | AST parse: DDL/DML/çoklu ifade/sistem şeması/tehlikeli fonksiyon reddi, zorunlu LIMIT |
| 3 | Prompt | `instructions.md` | Doğru davranış — ama son savunma değil |

Yazma işlemleri **SQL'den geçmez**; `tools/locus_actions.py` mevcut Next.js
API route'larını çağırır, böylece uygulama validasyonu tek yerde kalır.

> **Ham tablo notu:** `musteriler_rapor` view'ı `security_invoker = true` olduğu
> için rolün alttaki üç tabloya (`musteriler`, `musteri_yaslandirma`,
> `musteri_belge_ozet`) da SELECT hakkı olmak zorunda. Bu tablolar katman 2'de
> (`sql_guard.py`) reddediliyor — agent onlara SQL yazamaz. Listede olmayan
> tablolar (`entity_notlar`, `musteri_favoriler`, `yukleme_loglari`,
> `panorama_sync_runs`) veritabanı seviyesinde erişilemez kalır.

## Kurulum

### 1. Veritabanı rolü

Supabase SQL Editor'de **`sql/agent_role_fix_v2.sql`** çalıştır. (Eski
`sql/agent_readonly_role.sql` tarihsel referans — v2 onun eksiklerini de onarır.)

Dosyanın 0. bölümünde parola placeholder'ı var; değiştirmeden çalıştırırsan
**hata verir ve hiçbir şey değişmez** (kaza koruması). Önce parola üret:

```bash
LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 40; echo
```

Sadece harf+rakam üretir — URL'de percent-encode gerekmez. Aynı değeri kök
`.env` içindeki `AGENT_DB_URL`'e de yaz.

Dosyanın sonundaki doğrulama bloğu 15 satırın hepsinde `GECTI` dönmeli.

> Kullanıcıyı Dashboard > Database > Roles ekranından da oluşturabilirsin, ama
> gerisi (rol üyeliği, `default_transaction_read_only` gibi rol ayarları,
> grant'lar, RLS politikaları) yalnız SQL ile yapılır. Hepsini tek dosyada
> tutmak daha güvenli — script kullanıcı varsa parolayı günceller, yoksa
> oluşturur.

### 2. Ortam değişkenleri

Tek düzenleme yeri **repo kökündeki `.env`**. `agent/.env` ondan üretilir:

```bash
./sync-env.sh
```

Beyaz liste kopyalanır (`ANTHROPIC_API_KEY`, `AGENT_INGRESS_SECRET`,
`AGENT_DB_URL`, `LOCUS_API_BASE`, `AGENT_API_SECRET`). Symlink **bilerek
kullanılmıyor**: agent sürecine `SUPABASE_SERVICE_KEY` ve `AUTH_PASSWORD`
girmesin. Agent'ın güvenlik modelinin tamamı, onun service_role'a ASLA sahip
olmamasına dayanıyor.

`AGENT_INGRESS_SECRET` frontend→agent paylaşılan sırdır (`x-agent-secret`).
`AGENT_API_SECRET` ters yöndür (agent→frontend yazma araçları). Karıştırma.
Ingress sırrı 40+ karakter rastgele olmalı; yoksa sunucu açılışta durur.

Kök `.env`'de `AGENT_URL=http://<sunucu>:2024/runs/stream` — bunu **yalnız
Next.js proxy'si** kullanır, agent'ın kendisi görmez.

> `AGENT_DB_URL` **locus_agent** kullanıcısı olmalı. service_role veya
> postgres koyarsan güvenlik modelinin 1. katmanı tamamen devre dışı kalır.

**⚠️ Pooler kullan, doğrudan bağlantıyı değil.**
`db.<ref>.supabase.co` yalnızca **AAAA (IPv6)** kaydı yayınlıyor; A kaydı yok.
IPv6'sı olmayan bir ağdan (ev/ofis ADSL'lerinin çoğu) bu host `failed to
resolve host` verir — bağlantı hatası değil, DNS hatası olarak görünür ve
parola/yetki sorunu sanılır. Supavisor pooler'ın IPv4'ü var:

```
postgresql://locus_agent.<proje_ref>:<parola>@aws-0-<bolge>.pooler.supabase.com:5432/postgres
```

İki fark: kullanıcı adı `<rol>.<proje_ref>` biçiminde, host pooler. Ölçüldü —
rol ayarlarının **dördü de** (`default_transaction_read_only`,
`statement_timeout`, `idle_in_transaction_session_timeout`, `search_path`)
pooler'dan geçiyor, hem session (5432) hem transaction (6543) modunda.
Session mode seçildi: agent uzun ömürlü bir süreç, oturum semantiği birebir
korunsun.

### 3. Çalıştır

```bash
uv sync
uv run langgraph dev --no-browser --port 2024 --allow-blocking
```

`--allow-blocking` **zorunlu**: `tools/sql_query.py` psycopg'yi senkron
çağırıyor, `langgraph dev` bunu varsayılan olarak `BlockingError` ile reddediyor.

`langgraph dev` **bellek içi**: sunucu yeniden başlarsa sohbet thread'leri
gider. Proxy (`/api/agent`) checkpointer boşsa Supabase geçmişini rakamsız
**playbook** olarak basar — agent yöntemi hatırlar, rakamı `sql_query` ile
yeniden çeker. Postgres checkpointer ayrıca gerekmez; küçük iç ekip için
bu yeterli.

Doğrulama (2026-08-23): `/api/agent` proxy'si üzerinden "Kaç aktif müşterimiz
var?" → `schema_lookup` + `sql_query` çalıştı, 170 KB SSE, cevap
*"951 aktif müşteri (toplam 1.318: 951 Aktif, 276 Pasif, 91 İptal)"*.

> **`LOCUS_API_BASE` dağıtımda değişmeli.** Yerelde `http://localhost:3000`
> doğru, ama uzak bir sunucuda barınan agent localhost'a ulaşamaz — dağıtımdan
> önce `https://locus-two-delta.vercel.app` yapılmalı. Yalnız YAZMA araçlarını
> (`tools/locus_actions.py`) etkiler; okuma sorguları bu değişkeni kullanmaz.
> Tersi de riskli: canlıya bakan bir değerle yerel `langgraph dev` çalıştırmak
> testin canlı veriye yazmasına yol açar.

## Testler

Güvenlik testleri dış bağımlılık istemez (yalnız `sqlglot`):

```bash
python3 -m venv .venv && .venv/bin/pip install sqlglot
.venv/bin/python evals/test_sql_guard.py
.venv/bin/python evals/test_templates.py
.venv/bin/python evals/test_router.py
```

Router testleri Haiku çağırmaz: JSON parse, çıplak ciro tuzağı, risk
clarify, `build_spec` SQL guard.


Şablon testleri home/slash kilitli metinlerin eşleştiğini, belirsiz
risk / KDV'siz ciro / alıntının eşleşmediğini ve üretilen SQL'in
`sql_guard`'dan geçtiğini doğrular (DB yok).

31 test: 23 reddetme (DROP, stacked query, CTE'ye gizlenmiş DELETE, ham tablo
join'i, `pg_read_file`, sistem şemaları…), 8 kabul, 1 LIMIT tavanı.

Katman 1 (veritabanı rolü) CANLI doğrulaması — `AGENT_DB_URL` doldurulduktan
sonra:

```bash
.venv/bin/python evals/test_db_layer1.py
```

Katalog ölçümünden farkı: `default_transaction_read_only` oturum açılırken
uygulanan bir rol ayarı, yani yazma korumasının gerçekten tuttuğu ancak
`locus_agent` olarak bağlanıp INSERT/UPDATE/DELETE/CREATE denemesiyle
kanıtlanabilir. Script bunu yapar ve okunabilir view'larda **0 satır** dönerse
"RLS politikası eksik" diye kaldırır — sessiz hatanın imzası budur.

`evals/tasks/*.md` — davranış testleri (`langgraph dev` içinde çalıştırılır).
**Kabul kriteri: bunlar geçmeden frontend'e bağlanmaz.**

## Yapı

```
agent.py              create_deep_agent — model + araç kaydı + prompt/skills/memory
harness.py            Opus 5 profili: GP subagent kapalı, Haiku özetleme, 5 dk cache
templates/            Home/slash kilitli sorular — Opus'suz SQL şablonu
router/               Haiku classify (template|clarify|oos|opus); SQL yazmaz
auth.py               x-agent-secret — proxy'nin AGENT_INGRESS_SECRET'i buradan doğrulanır
langgraph.json        LangGraph sunucu tanımı
sync-env.sh           kök .env -> agent/.env (beyaz listeli)
instructions.md       Türkçe sistem promptu, iş kuralı tuzakları
semantic/             İş sözlüğü — SQL doğruluğunun kaynağı
  metrikler.md          ciro (KDV!), risk (2 tip), borç bantları
  veri_kaynaklari.md    hangi view ne içerir, tazelik modeli
skills/               Alan bazlı sorgu playbook'ları
memories/agent/       Paylaşılan kurum hafızası (AGENTS.md)
tools/
  sql_guard.py          validator (güvenlik)
  sql_query.py          guarded çalıştırıcı
  schema_lookup.py      semantic layer erişimi
  locus_actions.py      yazma (Next.js API üzerinden)
middleware/audit.py   araç çağrısı logu
middleware/fast_path.py  exact → prefilter → Haiku classify; SQL Python'da
connectors/mcp.py     n8n — v2 iskelesi (v1'de pasif)
evals/                güvenlik + davranış testleri
```

## Bilinen sınırlar

- **Router / harness değişince VPS restart.** `oos` tuzakları ve prompt
  cache TTL `agent/` içinde; frontend yetmez. `git pull` sonra
  `docs/vps-setting.md` docker compose rebuild. Eski süreç eski kod tutar.
  Prompt cache **5 dk** olmalı — `1h` MemoryMiddleware'in 5 dk'sıyla
  çakışınca Anthropic 400 verir, ekranda "An internal error occurred" görünür.
- **Kişi bazlı kimlik yok.** Locus tek paylaşımlı giriş kullanıyor
  (`frontend/lib/auth.ts`), bu yüzden audit log "kim sordu"yu ayırt edemez.
  Gerçek kullanıcı sistemi eklenirse `auth.py` kullanıcı JWT'sine döner.
- **n8n v1'de bağlı değil.** `connectors/mcp.py` iskelesi hazır.
- `urun_skt` otomatik tazelenmez — fabrikadan 15 günde bir manuel yüklenir.
