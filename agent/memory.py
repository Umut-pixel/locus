"""Kalıcı hafıza — konuşmalar arası hatırlanacaklar.

`scope="agent"` = deployment geneli TEK paylaşımlı dilim,
`/memories/agent/` altına read/write bağlanır ve
`/memories/agent/AGENTS.md` her turda prompt'a enjekte edilir.

Locus için doğru seçim: sistemde kişi bazlı kimlik yok (tek paylaşımlı giriş —
frontend/lib/auth.ts), yani hafıza kullanıcıya değil kuruma ait. Kişisel tercih
saklamak zaten yanıltıcı olurdu.

⚠️  GÜVEN SINIRI
    Paylaşılan dilime bir turda yazılan şey, sonraki HER turda okunur —
    talimat gibi görünen metin dahil. Yani hafıza, çağıranlar arası bir
    kanaldır. Locus'ta tüm çağıranlar aynı küçük ekip olduğu için kabul
    edilebilir; agent halka açılırsa `scope="none"` yapılmalı.

    Ne yazılacağına dair kural `instructions.md` içindeki "Hafıza" bölümünde —
    define_memory bu rehberliği parametre olarak almıyor.
"""

from managed_deepagents import define_memory

memory = define_memory(scope="agent")
