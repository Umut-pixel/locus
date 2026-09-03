"""Locus operasyon asistanı — OSS deepagents + LangGraph.

Çalıştırma:
    langgraph dev --no-browser --port 2024 --allow-blocking
"""

from pathlib import Path

from deepagents import create_deep_agent
from deepagents.backends import CompositeBackend, FilesystemBackend, StateBackend

from memory import MEMORY_PATHS
from middleware.audit import audit_tool_calls
from middleware.cache_usage import log_prompt_cache
from middleware.fast_path import fast_path
from harness import register_locus_harness
from tools.locus_actions import (
    musteri_favori_toggle,
    musteri_notu_ekle,
    rapor_cek,
    rapor_listesi,
    rota_taslagi_kaydet,
    rota_taslagi_olustur,
)
from tools.konusma_gecmisi import konusma_gecmisi
from tools.schema_lookup import schema_lookup
from tools.sql_query import sql_query

_DIR = Path(__file__).resolve().parent
_INSTRUCTIONS = (_DIR / "instructions.md").read_text(encoding="utf-8")

# Skills ve hafıza diskten okunsun; .env / kaynak kod filesystem araçlarına
# açılmasın. MDA bu mount'ları build sırasında enjekte ediyordu.
_BACKEND = CompositeBackend(
    default=StateBackend(),
    routes={
        "/skills/": FilesystemBackend(root_dir=_DIR / "skills", virtual_mode=True),
        "/memories/": FilesystemBackend(root_dir=_DIR / "memories", virtual_mode=True),
    },
)

# Ana model: SQL planlama ve finansal analiz. Bu işte yanlış kolon seçmek
# sessizce %20 sapmalı rakam üretir, o yüzden en güçlü akıl yürütme katmanı.
MAIN_MODEL = "anthropic:claude-opus-5"

# Context-window özetleme — ucuz / hızlı. SQL ve analiz Opus'ta kalır.
FAST_MODEL = "anthropic:claude-haiku-4-5"

register_locus_harness(
    model_id=MAIN_MODEL,
    fast_model=FAST_MODEL,
    backend=_BACKEND,
)

agent = create_deep_agent(
    name="locus-analyst",
    model=MAIN_MODEL,
    system_prompt=_INSTRUCTIONS,
    skills=["/skills"],
    memory=MEMORY_PATHS,
    backend=_BACKEND,
    tools=[
        schema_lookup,          # önce: iş sözlüğü
        sql_query,              # sonra: guarded okuma
        konusma_gecmisi,        # geçmiş thread'ler / kullanıcı amacı
        musteri_notu_ekle,      # yazma (yalnız açık istek üzerine)
        musteri_favori_toggle,
        # Sistem aksiyonları. Taslak kurmak zararsız; kaydetmek yıkıcı
        # (sil-sonra-yaz) — o yüzden ikisi ayrı araç ve arada kullanıcı onayı
        # var (bkz. instructions.md "Rota kurma").
        rota_taslagi_olustur,
        rota_taslagi_kaydet,
        rapor_listesi,          # okuma: hangi raporlar çekilebilir
        rapor_cek,
    ],
    middleware=[fast_path, audit_tool_calls, log_prompt_cache],
)
