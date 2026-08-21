# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
"""Shared public type aliases."""

from collections.abc import Mapping
from typing import TypeAlias

JsonPrimitive: TypeAlias = str | int | float | bool | None
JsonValue: TypeAlias = (
    JsonPrimitive | Mapping[str, "JsonValue"] | list["JsonValue"] | tuple["JsonValue", ...]
)
JsonObject: TypeAlias = Mapping[str, JsonValue]
