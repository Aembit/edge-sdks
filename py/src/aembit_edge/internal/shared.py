"""Internal shared helpers."""

from collections.abc import Mapping
from typing import TypeGuard, cast


def is_string_key_mapping(value: object) -> TypeGuard[Mapping[str, object]]:
    """Return true when a value is a mapping with string keys."""

    if not isinstance(value, Mapping):
        return False

    mapping = cast(Mapping[object, object], value)
    for key in mapping.keys():
        if not isinstance(key, str):
            return False
    return True
