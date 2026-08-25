"""Kilitli home/slash soruları — Opus turunu atlayan şablon katmanı.

Router (Haiku classify) `build_spec` ile buraya düşer; SQL hâlâ Python.
Opus effort=high sabit; global effort=low yok.
"""

from templates.catalog import build_spec, match_template
from templates.match import TemplateSpec, is_quoted_prompt, tr_fold

__all__ = [
    "TemplateSpec",
    "build_spec",
    "is_quoted_prompt",
    "match_template",
    "tr_fold",
]
