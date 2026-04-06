import pytest

from aembit_edge.credentials import CredentialServerRef
from aembit_edge.errors import AuthError, CredentialError
from aembit_edge.internal.client.auth_parsing import (
    calculate_expires_at_ms,
    parse_access_token,
    parse_auth_success_body,
)
from aembit_edge.internal.client.credential_parsing import (
    normalize_server_ref,
    parse_credential_success_body,
)


def test_parse_access_token_strips_whitespace() -> None:
    assert parse_access_token("  token-1  ") == "token-1"


def test_parse_access_token_rejects_missing_value() -> None:
    with pytest.raises(AuthError):
        parse_access_token(None)


def test_parse_auth_success_body_accepts_optional_expiry() -> None:
    assert parse_auth_success_body({"accessToken": "token-1"}) == {"accessToken": "token-1"}


def test_calculate_expires_at_ms_allows_non_expiring_tokens() -> None:
    assert calculate_expires_at_ms(None, 1_000) is None


def test_calculate_expires_at_ms_rejects_negative_values() -> None:
    with pytest.raises(AuthError):
        calculate_expires_at_ms(-1, 1_000)


def test_parse_auth_success_body_rejects_non_finite_expiry() -> None:
    with pytest.raises(AuthError):
        parse_auth_success_body({"accessToken": "token-1", "expiresIn": float("nan")})

    with pytest.raises(AuthError):
        parse_auth_success_body({"accessToken": "token-1", "expiresIn": float("inf")})


def test_normalize_server_ref_returns_protocol_shape() -> None:
    assert normalize_server_ref(CredentialServerRef(host=" db.internal ", port=443)) == {
        "host": "db.internal",
        "port": 443,
        "transportProtocol": "TCP",
    }


def test_normalize_server_ref_treats_none_transport_protocol_as_tcp() -> None:
    assert normalize_server_ref(
        CredentialServerRef(host="db.internal", port=443, transport_protocol=None)  # type: ignore[arg-type]
    ) == {
        "host": "db.internal",
        "port": 443,
        "transportProtocol": "TCP",
    }


def test_normalize_server_ref_rejects_invalid_port() -> None:
    with pytest.raises(CredentialError):
        normalize_server_ref(CredentialServerRef(host="db.internal", port=0))


def test_normalize_server_ref_rejects_invalid_runtime_types() -> None:
    with pytest.raises(CredentialError):
        normalize_server_ref(None)

    with pytest.raises(CredentialError):
        normalize_server_ref({"host": "db.internal", "port": 443})

    with pytest.raises(CredentialError):
        normalize_server_ref(CredentialServerRef(host=None, port=443))  # type: ignore[arg-type]

    with pytest.raises(CredentialError):
        normalize_server_ref(CredentialServerRef(host="db.internal", port=True))

    with pytest.raises(CredentialError):
        normalize_server_ref(CredentialServerRef(host="db.internal", port=443.5))  # type: ignore[arg-type]


def test_parse_credential_success_body_validates_data_shape() -> None:
    assert parse_credential_success_body(
        {"credentialType": "ApiKey", "expiresAt": None, "data": {"token": "value"}}
    ) == {
        "credentialType": "ApiKey",
        "expiresAt": None,
        "data": {"token": "value"},
    }


def test_parse_credential_success_body_rejects_non_mapping_data() -> None:
    with pytest.raises(CredentialError):
        parse_credential_success_body({"data": ["bad"]})


def test_parse_credential_success_body_rejects_null_credential_type() -> None:
    with pytest.raises(CredentialError):
        parse_credential_success_body({"credentialType": None})


def test_parse_credential_success_body_rejects_null_data() -> None:
    with pytest.raises(CredentialError):
        parse_credential_success_body({"data": None})
