"""Locus-specific deepagents harness — subagent kapalı, Haiku özetleme, 5 dk cache.

create_deep_agent çağrılmadan önce register edilmeli.
"""

from __future__ import annotations

from langchain.chat_models import init_chat_model
from langchain_anthropic.middleware import AnthropicPromptCachingMiddleware

from deepagents import (
    GeneralPurposeSubagentProfile,
    HarnessProfile,
    register_harness_profile,
)
from deepagents.backends.protocol import BackendProtocol
from deepagents.middleware.summarization import (
    SummarizationMiddleware,
    compute_summarization_defaults,
)

# Opus 5'te built-in harness yok; paralel araç çağrısı varsayılan değil.
_PARALLEL_TOOLS = """\
<use_parallel_tool_calls>
If you intend to call multiple tools and there are no dependencies between the tool calls, make all of the independent tool calls in parallel. Prioritize calling tools simultaneously whenever the actions can be done in parallel rather than sequentially.
</use_parallel_tool_calls>
"""


class LocusPromptCache(AnthropicPromptCachingMiddleware):
    """Prompt cache 5 dk.

    1 saat (`ttl=1h`) Anthropic'te yasak: MemoryMiddleware son system
    bloğuna ttl'siz (yani 5 dk) `cache_control` basıyor. Sıra tools →
    system → messages; 1 saatlik blok 5 dk'lık bloktan sonra gelince API 400 veriyor ve
    LangGraph bunu "An internal error occurred" diye yutuyor.
    Exclusion tam sınıf adına bakıyor; bu yüzden alt sınıf.
    """

    name = "LocusPromptCache"


class LocusFastSummarization(SummarizationMiddleware):
    """Context compaction Haiku'da. Alt sınıf olduğu için `.name` Opus
    varsayılanı olan `SummarizationMiddleware` değil — exclusion onu silmez.

    deepagents: `type(self) is _DeepAgentsSummarizationMiddleware` değilse
    `type(self).__name__` döner.
    """


def _haiku_summarization(fast_model: str, backend: BackendProtocol) -> LocusFastSummarization:
    model = init_chat_model(fast_model)
    defaults = compute_summarization_defaults(model)
    return LocusFastSummarization(
        model=model,
        backend=backend,
        trigger=defaults["trigger"],
        keep=defaults["keep"],
        truncate_args_settings=defaults["truncate_args_settings"],
    )


def register_locus_harness(
    *,
    model_id: str,
    fast_model: str,
    backend: BackendProtocol,
) -> HarnessProfile:
    """GP subagent kapalı; özetleme Haiku; prompt cache 5 dk."""
    profile = HarnessProfile(
        system_prompt_suffix=_PARALLEL_TOOLS,
        general_purpose_subagent=GeneralPurposeSubagentProfile(enabled=False),
        excluded_middleware=frozenset(
            {
                "AnthropicPromptCachingMiddleware",
                "SummarizationMiddleware",
            }
        ),
        extra_middleware=[
            _haiku_summarization(fast_model, backend),
            LocusPromptCache(ttl="5m", unsupported_model_behavior="ignore"),
        ],
    )
    register_harness_profile(model_id, profile)
    return profile
