"""Harness profili — GP kapalı, Haiku özetleme adı ayrı, 1 saat cache."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from deepagents import GeneralPurposeSubagentProfile, HarnessProfile  # noqa: E402

from harness import LocusFastSummarization, LocusPromptCache  # noqa: E402
from middleware.cache_usage import _usage_from  # noqa: E402
from deepagents.middleware.summarization import (  # noqa: E402
    SummarizationMiddleware as DeepSummarization,
)


def test_gp_disabled():
    profile = HarnessProfile(
        general_purpose_subagent=GeneralPurposeSubagentProfile(enabled=False),
        excluded_middleware=frozenset(
            {"AnthropicPromptCachingMiddleware", "SummarizationMiddleware"}
        ),
    )
    assert profile.general_purpose_subagent is not None
    assert profile.general_purpose_subagent.enabled is False
    assert "SummarizationMiddleware" in profile.excluded_middleware
    assert "AnthropicPromptCachingMiddleware" in profile.excluded_middleware


def test_haiku_summarization_name():
    assert issubclass(LocusFastSummarization, DeepSummarization)
    assert LocusFastSummarization.__name__ == "LocusFastSummarization"
    assert LocusFastSummarization.__name__ != "SummarizationMiddleware"


def test_prompt_cache_ttl():
    cache = LocusPromptCache(ttl="1h", unsupported_model_behavior="ignore")
    assert cache.ttl == "1h"
    assert cache.name == "LocusPromptCache"
    assert cache.name != "AnthropicPromptCachingMiddleware"


def test_cache_usage_parse():
    class Msg:
        usage_metadata = {
            "input_tokens": 100,
            "output_tokens": 20,
            "input_token_details": {"cache_read": 80, "cache_creation": 5},
        }

    usage = _usage_from(Msg())
    assert usage["input_tokens"] == 100
    assert usage["input_token_details"]["cache_read"] == 80


if __name__ == "__main__":
    test_gp_disabled()
    test_haiku_summarization_name()
    test_prompt_cache_ttl()
    test_cache_usage_parse()
    print("harness ok")
