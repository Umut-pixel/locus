# Görev: Agent'ı LangSmith ve managed-deepagents bağımlılığından kurtar

> Bu dosya bir **çalışma talimatıdır** (Cursor/Claude Code için). Baştan sona oku,
> sırayla uygula, sonunda kabul kriterlerini çalıştır.

## Bağlam ve amaç

`agent/` dizinindeki Locus operasyon asistanı şu an **Managed Deep Agents (MDA)**
üzerine kurulu. İki sorun var:

1. **`mda deploy` çalışmıyor** — LangSmith organizasyonu Plus/Enterprise planında
   değil. Lisans **alınmayacak**, bu bir ürün kararı.
2. **LangSmith request yolunda** — `identity.py` içindeki
   `auth.langsmith_api_key()` her istekte LangSmith API'sine gidip anahtarı
   doğruluyor. Yani kendi sunucunda barındırsan bile dış servise bağımlısın.

**Hedef:** LangSmith'i ve `managed-deepagents` paketini tamamen çıkar. Geriye
yalnız MIT lisanslı OSS kalsın: `langgraph` + `langchain` + `deepagents`.
Agent kendi sunucunda, dış servise hiç gitmeden çalışsın.

**Hedef DEĞİL:** LangChain/LangGraph'ı bırakmak. İkisi de MIT, sorun onlarda değil.
Anthropic SDK'ya tam geçiş ayrı bir tartışma — bu görevin kapsamı dışında.

---

## Doğrulanmış gerçekler — bunları yeniden keşfetme

Aşağıdakiler 2026-08-23'te canlı ortamda ölçüldü. Doğru kabul et.

### Migrasyon yüzeyi çok dar
`managed_deepagents`'ı yalnız **3 dosya** import ediyor:
- `agent/agent.py` → `define_deep_agent`
- `agent/identity.py` → `auth`, `define_identity`
- `agent/memory.py` → `define_memory`

`connectors/mcp.py`'de yalnız **yorum satırında** geçiyor (v2 iskelesi, pasif).
**`tools/*.py` ve `middleware/audit.py` MDA'dan tamamen bağımsız — onlara dokunma.**

### OSS `deepagents` birebir karşılık sunuyor
`deepagents==0.7.8` (MIT) `create_deep_agent` fonksiyonunu veriyor ve imzası
MDA'nın verdiği her şeyi kapsıyor:

```
model, tools, system_prompt, middleware, subagents, skills, memory,
permissions, backend, interrupt_on, response_format, state_schema,
context_schema, checkpointer, store, debug, name, cache
```

Tip bilgisi (ölçüldü):
- `skills: list[str] | None` — **dizin YOLLARI listesi**, otomatik keşif yok
- `memory: list[str] | None` — **yol listesi**
- `system_prompt: str | SystemMessage | None`
- `checkpointer: None | bool | BaseCheckpointSaver`

### ⚠️ MDA'nın sessizce yaptığı üç şey — elle yapman gerekecek
Bunlar `agent.py`'de görünmüyor çünkü MDA build sırasında enjekte ediyordu:
1. **`instructions.md`'yi sistem promptu olarak yüklemek.** `create_deep_agent`
   bunu yapmaz — dosyayı okuyup `system_prompt=` ile vermelisin. Yapmazsan agent
   iş kurallarını (KDV tuzağı, risk tanımları) tamamen kaybeder ve **sessizce
   yanlış rakam üretir**.
2. **`skills/` dizinini keşfetmek** (`has_skills=True`). Artık yolları açıkça ver.
3. **`memory` bağlamak** (`define_memory(scope="agent")`).

### Frontend protokolü — DEĞİŞTİRME
`frontend/lib/agent-stream.ts` LangGraph'ın `/runs/stream` SSE biçimini
(`messages/partial`, `messages/complete`, kümülatif metin) ayrıştırıyor ve bu
biçim gerçek sunucudan ölçülerek yazılmış. LangGraph sunucusu kaldığı için
**bu dosyaya dokunma.** Tek değişecek şey proxy'nin gönderdiği auth başlığı.

### Çalıştığı doğrulanmış kurulum
Ücretsiz OSS `langgraph-cli[inmem]` bu agent'ı sorunsuz servis ediyor. Uçtan uca
test edildi: `/api/agent` → LangGraph → `schema_lookup` + `sql_query` → Supabase,
170 KB SSE, doğru cevap ("951 aktif müşteri"). Lisans kapısı yok.

**Gerekli bayrak:** `--allow-blocking`. `tools/sql_query.py` psycopg'yi senkron
çağırıyor, `langgraph dev` bunu varsayılan olarak `BlockingError` ile reddediyor.

### Windows tuzağı
`mda build` Windows'ta bozuk `pyproject.toml` üretiyor:
`'managed-deepagents @ file://\\?\C:\...'` — `\\?\` uzun-yol öneki + boşluklu
klasör adı geçersiz PEP 508. **Bu görev `mda build`i tamamen kaldırdığı için
sorun kendiliğinden yok oluyor.**

---

## Yapılacaklar

### 1. `agent/agent.py` — MDA'yı OSS ile değiştir

`from managed_deepagents import define_deep_agent` yerine
`from deepagents import create_deep_agent`.

Çağrıyı şu üç eklemeyle kur (yukarıdaki "sessizce yaptığı üç şey"):
- `system_prompt=` ← `instructions.md` dosyasının içeriği (yol, bu dosyaya göre
  göreli çözülmeli — `pathlib.Path(__file__).parent` kullan, `os.getcwd()` değil)
- `skills=` ← `skills/` altındaki dört dizinin yolu
- `memory=` ← MDA'daki `scope="agent"` davranışının karşılığı

`name`, `model`, `tools`, `middleware` mevcut değerleriyle kalsın.
`MAIN_MODEL`/`FAST_MODEL` sabitlerini ve mevcut açıklama yorumlarını koru.

`create_deep_agent` derlenmiş bir graph döndürür — `mda build`in ürettiği
`_mda_entry.py` sarmalayıcısına artık gerek yok.

### 2. `agent/identity.py` → paylaşılan sırlı auth

Bu dosyayı **sil** ve yerine `agent/auth.py` yaz. `langgraph_sdk.Auth`
kullan (`from langgraph_sdk import Auth` — mevcut, doğrulandı; `@auth.authenticate`
dekoratörü var).

Davranış:
- İstek başlığında paylaşılan sırrı bekle. **Başlık adını kendin seç ve
  frontend proxy'siyle birebir eşleştir** (öneri: `x-agent-secret`).
- Sır `AGENT_INGRESS_SECRET` ortam değişkeninden okunsun.
- Değişken tanımlı değilse **sunucu açılışta hata versin** — sessizce
  auth'suz çalışmasın. Bu bir güvenlik sınırı.
- Karşılaştırmayı `hmac.compare_digest` ile yap (timing attack).
- Eşleşmezse 401.

`identity.py`'nin başındaki açıklama yorumunu (neden `auth.supabase` seçilmedi,
tek paylaşımlı giriş) yeni dosyaya uyarlayarak taşı — o bilgi hâlâ geçerli.

### 3. `agent/memory.py` — MDA'sız hale getir

`define_memory` MDA'ya ait. `create_deep_agent`'ın `memory: list[str]`
parametresine uygun hale getir ya da dosyayı kaldırıp yolu doğrudan
`agent.py`'de ver — hangisi daha az dolaylıysa.

**Dosyadaki "GÜVEN SINIRI" uyarısını kaybetme** (paylaşılan hafızaya yazılan
metin sonraki her turda okunur = çağıranlar arası kanal). Bu yorum nereye
giderse gitsin kalmalı.

### 4. `agent/langgraph.json` — elle yaz

`mda build` üretiyordu, artık repo'da kalıcı bir dosya olacak. Referans olarak
üretilmiş hali `agent/.mda/build/langgraph.json` içinde duruyor; ondan
kopyalarken **MDA'ya özgü satırları çıkar**:
- `graphs` → `agent.py`'deki graph'a işaret etsin (`_mda_entry.py` değil)
- `auth.path` → yeni `auth.py`'ye
- `http.app` (`_mda_http.py`) ve `_INTERNAL_docker_tag` → **sil**
- `env: ".env"` kalsın

### 5. `agent/pyproject.toml`

- `managed-deepagents` bağımlılığını **çıkar**
- `deepagents>=0.7.8` zaten var, kalsın
- `langgraph-cli[inmem]>=0.4.30` **ekle** (sunucu artık bunun üzerinden)
- `langgraph`, `langchain`, `psycopg[binary]`, `sqlglot`, `httpx` kalsın

### 6. `frontend/app/api/agent/route.ts`

- `x-api-key: LANGSMITH_API_KEY` yerine seçtiğin başlığı + `AGENT_INGRESS_SECRET`
  gönder.
- Uzak adres için anahtar zorunluluğu kontrolünü (`isLocal` mantığı) yeni sırra
  göre güncelle — **kontrolü kaldırma**, amacı hâlâ geçerli: kimliksiz istek
  uzak bir uca gitmesin.
- `LANGSMITH_ASSISTANT_ID` / `ASSISTANT_ID` mantığı **kalsın** — LangGraph hâlâ
  `assistant_id` istiyor ve `agent.py`'deki `name=` ile eşleşmeli.
- Dosyanın başındaki "neden proxy" yorumunu güncelle (artık LangSmith değil,
  kendi sunucumuz).

### 7. Ortam değişkenleri

**Kaldır:** `LANGSMITH_API_KEY`, `LANGSMITH_ENDPOINT`, `LANGSMITH_TENANT_ID`,
`LANGSMITH_AUTH_ENDPOINT`, `LANGSMITH_WORKSPACE_ID`
**Ekle:** `AGENT_INGRESS_SECRET` (40+ karakter rastgele)
**Kalsın:** `LANGSMITH_AGENT_URL` (adı artık yanıltıcı — `AGENT_URL` olarak
yeniden adlandır ve tüm kullanım yerlerini güncelle), `ANTHROPIC_API_KEY`,
`AGENT_DB_URL`, `LOCUS_API_BASE`, `AGENT_API_SECRET`

Güncellenecek dosyalar: kök `.env.example`, `agent/.env.example`,
`agent/sync-env.sh` (beyaz liste).

> `AGENT_API_SECRET` ile `AGENT_INGRESS_SECRET` **farklı yönler**, karıştırma:
> ingress = frontend→agent, api = agent→frontend (yazma araçları).

### 8. `agent/README.md`

Kurulum ve çalıştırma bölümlerini yeni gerçeğe göre yaz. `mda` komutları gider,
yerine `langgraph dev ... --allow-blocking` gelir. Bölge/plan/Windows uyarıları
artık geçersiz — **sil**, ama "neden MDA'dan çıkıldı" tek paragrafla kalsın.
Güvenlik modeli tablosundaki 3 katman (DB rolü / sql_guard / prompt) **aynen
geçerli**, dokunma.

### 9. Temizlik

`agent/.mda/` (build çıktısı, gitignore'da) ve MDA'ya özgü artıklar gitsin.
`mda` CLI'ı kaldırmak zorunlu değil ama README'de artık gerekmediği yazsın.

---

## Kabul kriterleri

Sırayla çalıştır, hepsi geçmeli.

**1. MDA'ya hiç referans kalmadı**
```bash
grep -rn "managed_deepagents\|managed-deepagents\|mda " --include=*.py --include=*.toml --include=*.json --include=*.ts agent/ frontend/ | grep -v ".venv"
```
Yalnız `connectors/mcp.py`'deki yorum satırı ve README'deki tarihçe paragrafı
çıkabilir. Başka bir şey çıkmamalı.

**2. LangSmith request yolundan çıktı**
```bash
grep -rn "LANGSMITH" --include=*.py --include=*.ts --include=*.sh agent/ frontend/ | grep -v ".venv"
```
Auth ya da runtime ile ilgili hiçbir şey çıkmamalı.

**3. Sunucu ayağa kalkıyor**
```bash
cd agent && .venv/Scripts/langgraph.exe dev --no-browser --port 2024 --no-reload --allow-blocking
```
Logda `Application started up` ve graph adının yüklendiği görünmeli.

**4. Auth gerçekten uyguluyor** — sırsız istek **401** dönmeli:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:2024/runs/stream \
  -H "Content-Type: application/json" \
  -d '{"assistant_id":"locus-analyst","input":{"messages":[{"role":"user","content":"test"}]},"stream_mode":"messages"}'
```

**5. Uçtan uca cevap** — doğru sırla, Türkçe karakter sorunundan kaçınmak için
gövdeyi dosyadan gönder:
```bash
curl -s -N --max-time 240 http://127.0.0.1:2024/runs/stream \
  -H "Content-Type: application/json" -H "<secilen-baslik>: $AGENT_INGRESS_SECRET" \
  --data-binary @body.json | grep -c "messages/partial"
```
Sıfırdan büyük olmalı.

**6. Frontend üzerinden** — `npm run dev`, giriş yap, AI asistanına
*"Kaç aktif müşterimiz var?"* sor. Beklenen: `schema_lookup` ve `sql_query`
çalışır, cevap **951 aktif müşteri** civarı (toplam 1.318: 951 Aktif, 276 Pasif,
91 İptal). Bu rakam 2026-08-23'te doğrulandı — tutmuyorsa sistem promptu
(`instructions.md`) yüklenmemiş olabilir, önce onu kontrol et.

**7. Güvenlik testleri geçiyor**
```bash
cd agent && .venv/Scripts/python.exe evals/test_sql_guard.py
```
31 testin hepsi geçmeli. Bu dosyalara dokunmadıysan zaten geçer — geçmiyorsa
yanlış bir şeye dokunmuşsun.

**8. Frontend derleniyor**
```bash
cd frontend && npx tsc --noEmit && npx eslint app/api/agent lib/agent-stream.ts
```

---

## Yapma

- **`frontend/lib/agent-stream.ts`'i değiştirme.** SSE biçimi gerçek sunucudan
  ölçülerek yazıldı ve LangGraph kaldığı için geçerliliğini koruyor.
- **`tools/` ve `middleware/audit.py`'ye dokunma.** MDA'dan bağımsızlar.
  Özellikle `sql_guard.py` bir güvenlik sınırı — 186 satır AST doğrulaması,
  yeniden yazma.
- **`semantic/`, `skills/`, `instructions.md` içeriğini değiştirme.** Bunlar iş
  bilgisi; yalnız nasıl *yüklendikleri* değişiyor.
- **Auth'u tamamen kaldırma.** "Nasılsa sadece proxy erişiyor" yeterli değil;
  sunucu ağda açıksa kimlik doğrulaması olmalı.
- **`sql/` altındaki DB rolü dosyalarına dokunma.** Güvenlik modelinin 1.
  katmanı orada ve bu görevle ilgisi yok.
- Model kimliklerini (`anthropic:claude-opus-5`, `anthropic:claude-haiku-4-5`)
  değiştirme.

---

## Takılırsan

- `create_deep_agent` imzasını doğrulamak için:
  `python -c "import inspect,deepagents; print(inspect.signature(deepagents.create_deep_agent))"`
- Referans build çıktısı `agent/.mda/build/` altında duruyor — `langgraph.json`
  ve auth şemasını oradan görebilirsin (ama MDA'ya özgü kısımları taşıma).
- Sunucu 500 veriyorsa logu oku; auth hataları `langgraph_sdk.auth.exceptions`
  üzerinden gelir.
- Port meşgulse: aynı anda iki sunucu dinliyor olabilir, eskisini öldür
  (`netstat -ano | grep :2024`).
