"""Kimlik sözleşmesi — çağıranlar deployment'a nasıl kimlik doğrular.

`langsmith_api_key` seçildi çünkü agent'a giden tek yol Next.js proxy'si:
`frontend/app/api/agent/route.ts` isteği sunucu tarafında yapıp
`x-api-key: LANGSMITH_API_KEY` başlığını ekliyor. Anahtar tarayıcıya asla
inmiyor; kullanıcı doğrulaması bir katman yukarıda, `frontend/middleware.ts`
oturum cookie'siyle yapılıyor.

`auth.supabase(...)` bilinçli olarak SEÇİLMEDİ: Locus, Supabase Auth değil tek
paylaşımlı giriş kullanıyor (`frontend/lib/auth.ts`), yani doğrulanacak
kullanıcı başına JWT yok. Gerçek kullanıcı sistemi eklenirse burası
`auth.supabase(project_ref="pzepnmzxrwnlhixdrgzm")` olarak değişir ve
her kullanıcı kendi thread'lerini alır.
"""

from managed_deepagents import auth, define_identity

identity = define_identity(auth=auth.langsmith_api_key())
