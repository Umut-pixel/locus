"""Locus operasyon asistanı — Managed Deep Agents tanımı.

Çalıştırma:
    mda dev .        # yerel + LangSmith Studio
    mda deploy .     # LangSmith Agent Server'a dağıt
"""

from managed_deepagents import define_deep_agent

from middleware.audit import audit_tool_calls
from tools.locus_actions import musteri_favori_toggle, musteri_notu_ekle
from tools.schema_lookup import schema_lookup
from tools.sql_query import sql_query

# Ana model: SQL planlama ve finansal analiz. Bu işte yanlış kolon seçmek
# sessizce %20 sapmalı rakam üretir, o yüzden en güçlü akıl yürütme katmanı.
MAIN_MODEL = "anthropic:claude-opus-5"

# Ucuz alt görevler (niyet sınıflandırma, özetleme) için.
FAST_MODEL = "anthropic:claude-haiku-4-5"

agent = define_deep_agent(
    name="locus-analyst",
    model=MAIN_MODEL,
    tools=[
        schema_lookup,      # önce: iş sözlüğü
        sql_query,          # sonra: guarded okuma
        musteri_notu_ekle,  # yazma (yalnız açık istek üzerine)
        musteri_favori_toggle,
    ],
    middleware=[audit_tool_calls],
)
