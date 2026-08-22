"""Kalıcı hafıza — konuşmalar arası hatırlanacaklar.

OSS `create_deep_agent(memory=...)` yol listesi ister. MDA'daki
`scope="agent"` karşılığı: deployment geneli tek paylaşımlı dilim,
`/memories/agent/AGENTS.md` her turda prompt'a enjekte edilir.

Locus için doğru seçim: sistemde kişi bazlı kimlik yok (tek paylaşımlı giriş —
frontend/lib/auth.ts), yani hafıza kullanıcıya değil kuruma ait. Kişisel tercih
saklamak zaten yanıltıcı olurdu.

⚠️  GÜVEN SINIRI
    Paylaşılan dilime bir turda yazılan şey, sonraki HER turda okunur —
    talimat gibi görünen metin dahil. Yani hafıza, çağıranlar arası bir
    kanaldır. Locus'ta tüm çağıranlar aynı küçük ekip olduğu için kabul
    edilebilir; agent halka açılırsa hafıza kapatılmalı.

    Ne yazılacağına dair kural `instructions.md` içindeki "Hafıza" bölümünde —
    create_deep_agent bu rehberliği parametre olarak almıyor.
"""

# CompositeBackend `/memories/` önekini agent/memories/ dizinine bağlar.
MEMORY_PATHS = ["/memories/agent/AGENTS.md"]
