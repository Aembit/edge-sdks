# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
"""Shared public type aliases and TypedDict structures."""

from collections.abc import Mapping
from typing import TypeAlias, TypedDict

JsonPrimitive: TypeAlias = str | int | float | bool | None
JsonValue: TypeAlias = (
    JsonPrimitive | Mapping[str, "JsonValue"] | list["JsonValue"] | tuple["JsonValue", ...]
)
JsonObject: TypeAlias = Mapping[str, JsonValue]


class ApiKeyData(TypedDict):
    """Payload data structure for API key credentials."""

    apiKey: str


class UsernamePasswordData(TypedDict):
    """Payload data structure for Username and Password credentials."""

    username: str
    password: str


class AwsStsData(TypedDict):
    """Payload data structure for AWS STS temporary credentials."""

    awsAccessKeyId: str
    awsSecretAccessKey: str
    awsSessionToken: str
