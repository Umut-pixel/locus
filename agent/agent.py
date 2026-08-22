"""Locus operasyon asistanı — OSS deepagents + LangGraph.

Çalıştırma:
    langgraph dev --no-browser --port 2024 --allow-blocking
"""

from pathlib import Path

from deepagents import create_deep_agent
from deepagents.backends import CompositeBackend, FilesystemBackend, StateBackend

from memory import MEMORY_PATHS
from middleware.audit import audit_tool_calls
from tools.locus_actions import musteri_favori_toggle, musteri_notu_ekle
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

# Ucuz alt görevler (niyet sınıflandırma, özetleme) için.
FAST_MODEL = "anthropic:claude-haiku-4-5"

agent = create_deep_agent(
    name="locus-analyst",
    model=MAIN_MODEL,
    system_prompt=_INSTRUCTIONS,
    skills=["/skills"],
    memory=MEMORY_PATHS,
    backend=_BACKEND,
    tools=[
        schema_lookup,      # önce: iş sözlüğü
        sql_query,          # sonra: guarded okuma
        musteri_notu_ekle,  # yazma (yalnız açık istek üzerine)
        musteri_favori_toggle,
    ],
    middleware=[audit_tool_calls],
)
