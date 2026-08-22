"""Semantic layer erişimi — şemanın İLGİLİ alt-grafını getirir.

Graph engineering ilkesi: tüm şemayı bağlama dökmek yerine, sorunun ilgilendiği
alt-grafı getir. Hem bağlam maliyetini düşürür hem de modelin yanlış kolona
sapmasını azaltır.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from langchain.tools import tool

_SEMANTIC_DIR = Path(__file__).resolve().parents[1] / "semantic"

_TOPICS: dict[str, tuple[str, ...]] = {
    "metrikler": ("metrikler.md",),
    "kaynaklar": ("veri_kaynaklari.md",),
    "hepsi": ("metrikler.md", "veri_kaynaklari.md"),
}


@lru_cache(maxsize=8)
def _read(filename: str) -> str:
    path = _SEMANTIC_DIR / filename
    if not path.is_file():
        return f"[eksik dosya: {filename}]"
    return path.read_text(encoding="utf-8")


@tool(parse_docstring=True)
def schema_lookup(konu: str = "hepsi") -> str:
    """Locus veri modelinin iş sözlüğünü ve kolon anlamlarını getirir.

    SQL yazmadan ÖNCE bunu çağır. Şemadaki isimler yanıltıcıdır — örneğin
    "net ciro" iki farklı kolonda iki farklı anlama gelir (KDV dahil/hariç)
    ve yanlış olanı seçmek %20 sapma üretir.

    Args:
        konu: "metrikler" (ciro/risk/borç tanımları), "kaynaklar" (hangi view
            ne içerir, tazelik), veya "hepsi" (varsayılan).
    """
    files = _TOPICS.get(konu.strip().lower(), _TOPICS["hepsi"])
    return "\n\n---\n\n".join(_read(f) for f in files)
