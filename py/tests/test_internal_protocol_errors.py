# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
from aembit_edge.internal.protocol.errors import (
    extract_edge_generic_error_body,
    extract_request_id,
    map_http_error,
    map_transport_error,
)


def test_extract_edge_generic_error_body_normalizes_fields() -> None:
    assert extract_edge_generic_error_body(
        {"message": "bad request", "id": 42, "success": False}
    ) == {"message": "bad request", "id": 42, "success": False}


def test_extract_request_id_handles_case_insensitive_headers() -> None:
    assert extract_request_id({"X-Request-Id": "req-1"}) == "req-1"


def test_extract_request_id_prefers_x_request_id_over_request_id() -> None:
    assert (
        extract_request_id({"request-id": "req-fallback", "x-request-id": "req-preferred"})
        == "req-preferred"
    )


def test_map_http_error_preserves_operation_kind_and_retryable() -> None:
    error = map_http_error(
        operation="auth",
        status_code=500,
        body={"message": "server failure", "id": 42},
        headers={"x-request-id": "req-500"},
    )

    assert error.kind == "auth"
    assert error.status_code == 500
    assert error.api_code == "42"
    assert error.request_id == "req-500"
    assert error.retryable is True


def test_map_transport_error_marks_errors_retryable_by_default() -> None:
    error = map_transport_error(RuntimeError("network down"))

    assert error.kind == "transport"
    assert error.retryable is True
    assert "network down" in str(error)
