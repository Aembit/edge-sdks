from __future__ import annotations

import pytest

from aembit_edge.internal.protocol.http_transport import default_http_sender


class _FakeHeaders:
    def items(self) -> list[tuple[str, str]]:
        return []


class _FakeResponse:
    headers = _FakeHeaders()

    def __enter__(self) -> _FakeResponse:
        return self

    def __exit__(self, exc_type: object, exc: object, tb: object) -> None:
        del exc_type, exc, tb

    def getcode(self) -> int:
        return 200

    def read(self) -> bytes:
        return b"{}"


def test_default_http_sender_clamps_zero_timeout_to_none(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    def fake_urlopen(request: object, timeout: float | None = None) -> _FakeResponse:
        captured["timeout"] = timeout
        del request
        return _FakeResponse()

    monkeypatch.setattr(
        "aembit_edge.internal.protocol.http_transport.urllib_request.urlopen",
        fake_urlopen,
    )

    default_http_sender(
        url="https://tenant.aembit.io/edge/v1/auth",
        method="POST",
        headers={},
        body=b"{}",
        timeout_ms=0,
    )

    assert captured["timeout"] is None


def test_default_http_sender_clamps_negative_timeout_to_none(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    def fake_urlopen(request: object, timeout: float | None = None) -> _FakeResponse:
        captured["timeout"] = timeout
        del request
        return _FakeResponse()

    monkeypatch.setattr(
        "aembit_edge.internal.protocol.http_transport.urllib_request.urlopen",
        fake_urlopen,
    )

    default_http_sender(
        url="https://tenant.aembit.io/edge/v1/auth",
        method="POST",
        headers={},
        body=b"{}",
        timeout_ms=-1,
    )

    assert captured["timeout"] is None
