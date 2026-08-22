"""Audit middleware — her araç çağrısını iz bırakacak şekilde kaydeder.

LangSmith zaten trace tutuyor; bu katman SQL'i ayrıca ve okunur biçimde
loglar, böylece "agent ne sordu / ne çalıştırdı" incelemesi trace'e girmeden
yapılabilir.

NOT: Sistemde kişi bazlı kimlik yok (tek paylaşımlı giriş — frontend/lib/auth.ts),
bu yüzden log "kim" sorusunu yanıtlayamaz, yalnız "ne" sorusunu yanıtlar.
"""

from __future__ import annotations

import logging

from langchain.agents.middleware import wrap_tool_call

logger = logging.getLogger("locus.agent.audit")

# Yazma yapan araçlar — log'da ayrıca işaretlenir.
_WRITE_TOOLS = {"musteri_notu_ekle", "musteri_favori_toggle"}


@wrap_tool_call
async def audit_tool_calls(request, handler):
    """Araç çağrılarını çalıştırmadan önce ve sonra logla."""
    name = request.tool_call.get("name", "<bilinmeyen>")
    args = request.tool_call.get("args", {}) or {}

    if name == "sql_query":
        logger.info("SQL isteniyor: %s", str(args.get("sql", ""))[:1000])
    elif name in _WRITE_TOOLS:
        logger.warning("YAZMA işlemi: %s args=%s", name, args)
    else:
        logger.info("Araç: %s", name)

    result = await handler(request)

    if name == "sql_query":
        preview = str(result)[:200].replace("\n", " ")
        rejected = "REDDEDİLDİ" in str(result)[:200]
        logger.log(
            logging.WARNING if rejected else logging.INFO,
            "SQL sonucu%s: %s", " (RED)" if rejected else "", preview,
        )
    return result
