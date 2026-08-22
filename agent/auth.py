"""Kimlik sözleşmesi — çağıranlar deployment'a nasıl kimlik doğrular.

Paylaşılan sır (`AGENT_INGRESS_SECRET`, başlık `x-agent-secret`) seçildi
çünkü agent'a giden tek yol Next.js proxy'si: `frontend/app/api/agent/route.ts`
isteği sunucu tarafında yapıp başlığı ekliyor. Sır tarayıcıya asla inmiyor;
kullanıcı doğrulaması bir katman yukarıda, `frontend/middleware.ts` oturum
cookie'siyle yapılıyor.

Supabase JWT bilinçli olarak SEÇİLMEDİ: Locus, Supabase Auth değil tek
paylaşımlı giriş kullanıyor (`frontend/lib/auth.ts`), yani doğrulanacak
kullanıcı başına JWT yok. Gerçek kullanıcı sistemi eklenirse burası
kullanıcı JWT'sine döner ve her kullanıcı kendi thread'lerini alır.
"""

from __future__ import annotations

import hmac
import os
from collections.abc import Mapping
from typing import Any

from langgraph_sdk import Auth

_HEADER = "x-agent-secret"
_SECRET = os.environ.get("AGENT_INGRESS_SECRET", "")
if not _SECRET:
    raise RuntimeError(
        "AGENT_INGRESS_SECRET tanımlı değil — agent kimliksiz açılmaz."
    )
_SECRET_BYTES = _SECRET.encode("utf-8")

auth = Auth()


def _header_value(headers: Mapping[Any, Any] | None, name: str) -> bytes:
    if not headers:
        return b""
    want = name.lower()
    for key, raw in headers.items():
        if isinstance(key, (bytes, bytearray)):
            got = key.decode("latin-1")
        else:
            got = str(key)
        if got.lower() != want:
            continue
        if isinstance(raw, (bytes, bytearray)):
            return bytes(raw)
        if raw is None:
            return b""
        return str(raw).encode("latin-1")
    return b""


@auth.authenticate
async def authenticate(headers: dict) -> str:
    provided = _header_value(headers, _HEADER)
    if not hmac.compare_digest(provided, _SECRET_BYTES):
        raise Auth.exceptions.HTTPException(status_code=401, detail="Unauthorized")
    return "locus-proxy"
