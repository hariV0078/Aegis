from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable
import re
import uuid

try:
    from presidio_analyzer import AnalyzerEngine
    from presidio_anonymizer import AnonymizerEngine
    from presidio_anonymizer.entities import OperatorConfig
except Exception:  # pragma: no cover - fallback when Presidio is unavailable
    AnalyzerEngine = None
    AnonymizerEngine = None
    OperatorConfig = None


EMAIL_RE = re.compile(r"(?P<value>[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})")
PHONE_RE = re.compile(r"(?P<value>\+?\d[\d\s().-]{7,}\d)")
SSN_RE = re.compile(r"(?P<value>\b\d{3}-\d{2}-\d{4}\b)")
CARD_RE = re.compile(r"(?P<value>\b(?:\d[ -]*?){13,19}\b)")


@dataclass(frozen=True)
class _Match:
    start: int
    end: int
    value: str
    label: str


_analyzer = None
_anonymizer = None
if AnalyzerEngine and AnonymizerEngine:
    try:
        _analyzer = AnalyzerEngine()
        _anonymizer = AnonymizerEngine()
    except Exception:
        _analyzer = None
        _anonymizer = None


def _build_placeholder(label: str) -> str:
    return f"[{label}_{uuid.uuid4().hex[:6].upper()}]"


def _regex_matches(text: str) -> list[_Match]:
    matches: list[_Match] = []
    patterns: list[tuple[re.Pattern[str], str]] = [
        (EMAIL_RE, "EMAIL"),
        (PHONE_RE, "PHONE"),
        (SSN_RE, "SSN"),
        (CARD_RE, "CARD"),
    ]
    for pattern, label in patterns:
        for match in pattern.finditer(text):
            matches.append(_Match(match.start(), match.end(), match.group("value"), label))
    matches.sort(key=lambda item: (item.start, item.end))
    return matches


def _anonymize_with_regex(text: str) -> tuple[str, dict[str, str]]:
    matches = _regex_matches(text)
    if not matches:
        return text, {}

    token_map: dict[str, str] = {}
    output: list[str] = []
    cursor = 0
    for match in matches:
        if match.start < cursor:
            continue
        output.append(text[cursor:match.start])
        token = _build_placeholder(match.label)
        token_map[token] = match.value
        output.append(token)
        cursor = match.end
    output.append(text[cursor:])
    return "".join(output), token_map


def strip_pii(text: str) -> tuple[str, dict[str, str]]:
    """Return anonymized text plus a placeholder-to-value map."""
    if not text:
        return text, {}

    if _analyzer and _anonymizer and OperatorConfig:
        try:
            results = _analyzer.analyze(text=text, language="en")
            if not results:
                return text, {}

            token_map: dict[str, str] = {}
            replacement_items: list[tuple[int, int, str]] = []
            for result in results:
                placeholder = _build_placeholder(result.entity_type)
                token_map[placeholder] = text[result.start : result.end]
                replacement_items.append((result.start, result.end, placeholder))

            anonymized = text
            for start, end, placeholder in sorted(replacement_items, key=lambda item: item[0], reverse=True):
                anonymized = anonymized[:start] + placeholder + anonymized[end:]

            return anonymized, token_map
        except Exception:
            return _anonymize_with_regex(text)

    return _anonymize_with_regex(text)


def reidentify(text: str, token_map: dict[str, str]) -> str:
    result = text
    for token, real_value in sorted(token_map.items(), key=lambda item: len(item[0]), reverse=True):
        result = result.replace(token, real_value)
    return result


def count_pii_items(token_map: dict[str, str]) -> int:
    return len(token_map)
