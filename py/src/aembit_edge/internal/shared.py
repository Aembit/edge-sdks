"""Internal shared helpers."""

from collections.abc import Mapping
from typing import TypeGuard


def is_string_key_mapping(value: object) -> TypeGuard[Mapping[str, object]]:
    """Return true when a value is a mapping with string keys."""

    if not isinstance(value, Mapping):
        return False

    return all(isinstance(key, str) for key in value)
