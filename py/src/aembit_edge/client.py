# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
"""Public sync client API."""

from __future__ import annotations

import logging
import math
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from threading import Event, Lock
from typing import Generic, TypeGuard, TypeVar, cast

from .auth import AuthSession
from .config import EdgeClientConfig
from .credentials import CredentialResult, GetCredentialInput, GetCredentialOptions
from .errors import CredentialError, TrustProviderError
from .internal.client.auth_parsing import (
    calculate_expires_at_ms,
    parse_access_token,
    parse_auth_success_body,
)
from .internal.client.credential_parsing import (
    normalize_server_ref,
    parse_credential_success_body,
)
from .internal.client.token_state import (
    CachedTokenState,
    format_expires_at,
    is_token_valid,
    resolve_auth_expiry_skew_ms,
    resolve_effective_resource_set,
    serialize_auth_single_flight_key,
    serialize_effective_retry_policy_key,
)
from .internal.protocol import EdgeApi, EdgeApiRequestOptions, EdgeHttpTransport
from .internal.protocol.types import EdgeCredentialsRequestBody
from .retry import RetryPolicy
from .trust_providers import ClientWorkloadDetails, CollectedTrustProviderIdentity
from .types import JsonValue

logger = logging.getLogger("aembit_edge.client")


class EdgeClient:
    """High-level sync SDK client for authentication and credential retrieval."""

    def __init__(self, config: EdgeClientConfig) -> None:
        self._config = config
        self._auth_expiry_skew_ms = resolve_auth_expiry_skew_ms(config.auth_expiry_skew_ms)
        self._token_state: CachedTokenState | None = None
        self._state_lock = Lock()
        self._in_flight_auth_by_key: dict[str, _InFlight[CachedTokenState]] = {}
        self._in_flight_identity_by_key: dict[str, _InFlight[CollectedTrustProviderIdentity]] = {}
        self._api = EdgeApi(
            transport=EdgeHttpTransport(
                base_url=config.base_url,
                timeout_ms=config.timeout_ms,
                retry=config.retry,
            ),
            resource_set=config.resource_set,
        )
        self._now_ms: Callable[[], int] = lambda: int(time.time() * 1000)
        logger.debug(
            "EdgeClient initialized (base_url=%s, client_id=%s, trust_provider_id=%s)",
            config.base_url,
            config.client_id,
            config.trust_provider.id,
        )

    @property
    def config(self) -> EdgeClientConfig:
        """Return the client configuration used to construct this instance."""

        return self._config

    def authenticate(self) -> AuthSession:
        """Authenticate the configured workload."""
        logger.info(
            "Authenticating workload (clientId=%s, trustProviderId=%s)",
            self._config.client_id,
            self._config.trust_provider.id,
        )
        self._validate_resiliency_settings(self._config.retry, operation="authenticate")
        effective_resource_set = resolve_effective_resource_set(self._config.resource_set, None)
        identity = self._retrieve_workload_identity_proof()
        token_state = self._acquire_session_token(
            resource_set=effective_resource_set,
            retry=None,
            force=True,
            identity=identity,
        )
        session = AuthSession(
            expires_at=format_expires_at(token_state.expires_at_ms),
            trust_provider_id=self._config.trust_provider.id,
        )
        logger.info(
            "Workload authenticated successfully (trustProviderId=%s, expiresAt=%s)",
            self._config.trust_provider.id,
            session.expires_at,
        )
        return session

    def get_credential(
        self,
        request: GetCredentialInput,
        options: GetCredentialOptions | None = None,
    ) -> CredentialResult:
        """Retrieve credentials for a target server."""
        request, options = _verify_credential_request_parameters(request, options)

        effective_options = options or GetCredentialOptions()
        self._validate_resiliency_settings(self._config.retry, operation="get_credential")
        self._validate_resiliency_settings(effective_options.retry, operation="get_credential")
        server = normalize_server_ref(request.server)
        logger.info(
            "Retrieving credential (server=%s:%s, credentialType=%s)",
            server.get("host"),
            server.get("port"),
            request.credential_type,
        )
        effective_resource_set = resolve_effective_resource_set(
            self._config.resource_set,
            effective_options.resource_set,
        )
        identity = self._retrieve_workload_identity_proof()
        bearer_token = self._get_valid_access_token(
            resource_set=effective_resource_set,
            retry=effective_options.retry,
            identity=identity,
        )

        body: EdgeCredentialsRequestBody = {
            "client": identity.client,
            "server": server,
        }
        if request.credential_type is not None:
            body["credentialType"] = request.credential_type
        if request.connection_metadata is not None:
            body["connectionMetadata"] = request.connection_metadata
        if request.cert_signing_request is not None:
            body["certSigningRequest"] = request.cert_signing_request

        try:
            credential_body = parse_credential_success_body(
                self._api.credentials(
                    body,
                    bearer_token,
                    EdgeApiRequestOptions(
                        resource_set=effective_options.resource_set,
                        retry=effective_options.retry,
                    ),
                )
            )
            result = CredentialResult(
                credential_type=credential_body.get("credentialType"),
                expires_at=credential_body.get("expiresAt"),
                data=credential_body.get("data", {}),
            )
            logger.info(
                "Credential retrieved successfully (credentialType=%s, expiresAt=%s)",
                result.credential_type,
                result.expires_at,
            )
            return result
        except Exception as error:
            logger.exception(
                "Credential retrieval failed (server=%s:%s, error=%s)",
                server.get("host"),
                server.get("port"),
                str(error),
            )
            raise

    def _get_valid_access_token(
        self,
        *,
        resource_set: str | None,
        retry: RetryPolicy | None,
        identity: CollectedTrustProviderIdentity,
    ) -> str:
        current_state = self._token_state
        if (
            is_token_valid(current_state, self._now_ms(), self._auth_expiry_skew_ms)
            and current_state is not None
            and current_state.resource_set == resource_set
            and current_state.auth_cache_key == identity.auth_cache_key
        ):
            logger.debug(
                "Reusing valid cached access token (authCacheKey=%s, resourceSet=%s)",
                identity.auth_cache_key,
                resource_set,
            )
            return current_state.access_token

        logger.debug("Acquiring new access token")

        next_state = self._acquire_session_token(
            resource_set=resource_set,
            retry=retry,
            force=False,
            identity=identity,
        )
        return next_state.access_token

    def _acquire_session_token(
        self,
        *,  # bare '*' forces all subsequent arguments to be keyword-only (must be passed by name).
        resource_set: str | None,
        retry: RetryPolicy | None,
        force: bool,
        identity: CollectedTrustProviderIdentity,
    ) -> CachedTokenState:
        """Acquire an access token by calling the Edge /auth endpoint and caching the result."""
        retry_key = serialize_effective_retry_policy_key(
            base_retry=self._config.retry,
            request_retry=retry,
        )
        single_flight_key = serialize_auth_single_flight_key(
            resource_set=resource_set,
            auth_cache_key=identity.auth_cache_key,
            retry_key=retry_key,
        )

        #  'with' lock context is equivalent to C# 'lock (stateLock) { ... }'.
        with self._state_lock:
            current_state = self._token_state
            if (
                not force
                and is_token_valid(current_state, self._now_ms(), self._auth_expiry_skew_ms)
                and current_state is not None
                and current_state.resource_set == resource_set
                and current_state.auth_cache_key == identity.auth_cache_key
            ):
                return current_state

        def do_auth() -> CachedTokenState:
            try:
                logger.debug("Sending authentication request to Edge API")
                auth_body = parse_auth_success_body(
                    self._api.auth(
                        {
                            "clientId": self._config.client_id,
                            "client": identity.client,
                        },
                        EdgeApiRequestOptions(resource_set=resource_set, retry=retry),
                    )
                )
                next_state = CachedTokenState(
                    access_token=parse_access_token(auth_body.get("accessToken")),
                    expires_at_ms=calculate_expires_at_ms(
                        auth_body.get("expiresIn"),
                        self._now_ms(),
                    ),
                    resource_set=resource_set,
                    auth_cache_key=identity.auth_cache_key,
                )
                with self._state_lock:
                    self._token_state = next_state
                logger.debug(
                    "Authentication response received and token cached (expires_at_ms=%s)",
                    next_state.expires_at_ms,
                )
                return next_state
            except Exception as error:
                logger.exception(
                    "Authentication request failed (clientId=%s, error=%s)",
                    self._config.client_id,
                    str(error),
                )
                with self._state_lock:
                    curr = self._token_state
                    if (
                        curr is not None
                        and curr.resource_set == resource_set
                        and not is_token_valid(curr, self._now_ms(), self._auth_expiry_skew_ms)
                    ):
                        self._token_state = None
                raise

        return self._coalesce_concurrent_requests(
            key=single_flight_key,
            in_flight_dict=self._in_flight_auth_by_key,
            action=do_auth,
        )

    def _retrieve_workload_identity_proof(self) -> CollectedTrustProviderIdentity:
        """Asks the platform (e.g., AWS STS) to gather local cryptographic
        proof of who this workload is.
        """
        single_flight_key = self._generate_identity_cache_key()
        if single_flight_key is None:
            return self._collect_identity_uncached()

        return self._coalesce_concurrent_requests(
            key=single_flight_key,
            in_flight_dict=self._in_flight_identity_by_key,
            action=self._collect_identity_uncached,
        )

    def _generate_identity_cache_key(self) -> str | None:
        key_factory = getattr(self._config.trust_provider, "get_identity_single_flight_key", None)
        if key_factory is None:
            return None
        _validate_single_flight_key_factory(key_factory, self._config.trust_provider.id)

        try:
            key = key_factory()
        except TrustProviderError:
            raise
        except Exception as error:
            raise TrustProviderError(
                (f"Trust Provider '{self._config.trust_provider.id}' failed to collect identity"),
                retryable=False,
            ) from error

        _validate_resolved_single_flight_key(key, self._config.trust_provider.id)
        if not key:
            return None
        return key

    def _collect_identity_uncached(self) -> CollectedTrustProviderIdentity:
        logger.debug(
            "Collecting identity from Trust Provider (trustProviderId=%s)",
            self._config.trust_provider.id,
        )
        try:
            collector = cast(Callable[[], object], self._config.trust_provider.collect_identity)
            collected_value = collector()
        except TrustProviderError as error:
            logger.exception(
                "Trust Provider failed to collect identity (trustProviderId=%s, error=%s)",
                self._config.trust_provider.id,
                str(error),
            )
            raise
        except Exception as error:
            logger.exception(
                "Trust Provider failed to collect identity (trustProviderId=%s, error=%s)",
                self._config.trust_provider.id,
                str(error),
            )
            raise TrustProviderError(
                f"Trust Provider '{self._config.trust_provider.id}' failed to collect identity",
                retryable=False,
            ) from error

        collected = self._verify_trust_provider_response(collected_value)
        logger.debug(
            "Identity collected from Trust Provider (trustProviderId=%s, authCacheKey=%s)",
            self._config.trust_provider.id,
            collected.auth_cache_key,
        )

        return CollectedTrustProviderIdentity(
            client=_merge_client_workload_details(
                _sanitize_workload_data(
                    collected.client,
                    error_factory=lambda: TrustProviderError(
                        (
                            f"Trust Provider '{self._config.trust_provider.id}' returned invalid "
                            "identity data"
                        ),
                        retryable=False,
                    ),
                ),
                _normalize_client_workload_details(self._config.client_workload_details),
            ),
            auth_cache_key=collected.auth_cache_key,
        )

    def _verify_trust_provider_response(
        self,
        collected_value: object,
    ) -> CollectedTrustProviderIdentity:
        """Validates that the external trust provider returned complete
        and correct identity parameters.
        """
        if not isinstance(collected_value, CollectedTrustProviderIdentity):
            raise TrustProviderError(
                f"Trust Provider '{self._config.trust_provider.id}' returned invalid identity data",
                retryable=False,
            )
        client_value = cast(object, collected_value.client)
        if not isinstance(client_value, Mapping):
            raise TrustProviderError(
                f"Trust Provider '{self._config.trust_provider.id}' returned invalid identity data",
                retryable=False,
            )
        auth_cache_key_value = cast(object, collected_value.auth_cache_key)
        if auth_cache_key_value is not None and not isinstance(auth_cache_key_value, str):
            raise TrustProviderError(
                f"Trust Provider '{self._config.trust_provider.id}' returned invalid identity data",
                retryable=False,
            )
        return collected_value

    def _coalesce_concurrent_requests(
        self,
        key: str,
        in_flight_dict: dict[str, _InFlight[_T]],
        action: Callable[[], _T],
    ) -> _T:
        """Combines parallel threads requesting the same thing so we only call the API once."""
        with self._state_lock:
            is_in_flight = in_flight_dict.get(key)
            if is_in_flight is not None:
                in_flight = is_in_flight
                run_action = False
            else:
                in_flight = _InFlight[_T]()
                in_flight_dict[key] = in_flight
                run_action = True

        if not run_action:
            in_flight.done.wait()

            # Once unblocked, we check if the single execution failed or succeeded:
            if in_flight.error is not None:
                raise in_flight.error
            if in_flight.result is None:
                raise RuntimeError("In-flight operation completed without a result")
            return in_flight.result

        try:
            result = action()
            in_flight.result = result
            return result
        except Exception as error:
            in_flight.error = error
            raise
        finally:
            # Unblock all waiters simultaneously
            in_flight.done.set()

            # Clean up the dictionary under a lock so future requests start fresh
            with self._state_lock:
                current = in_flight_dict.get(key)
                if current is in_flight:
                    in_flight_dict.pop(key, None)

    def _validate_resiliency_settings(
        self,
        retry: object,
        *,
        operation: str,
    ) -> None:
        if retry is None:
            return
        if not isinstance(retry, RetryPolicy):
            raise CredentialError(
                f"{operation}() retry configuration must be a RetryPolicy instance",
                retryable=False,
            )

        _validate_auto_retry_toggle(retry, operation)
        _validate_network_backoff_settings(retry, operation)
        _validate_retryable_server_error_codes(retry, operation)


def _validate_auto_retry_toggle(
    retry: object,
    operation: str,
) -> None:
    """Verifies whether the automatic retry-on-failure safety mechanism exists."""
    enabled_value = cast(object, getattr(retry, "enabled", None))
    if enabled_value is not None and not isinstance(enabled_value, bool):
        raise CredentialError(
            f"{operation}() retry configuration contains an invalid enabled value",
            retryable=False,
        )


def _validate_network_backoff_settings(
    retry: object,
    operation: str,
) -> None:
    """Validates settings (delays and attempt counts) used for backing off and
    retrying to recover from transient network drops.
    """
    for field_name in ("max_attempts", "base_delay_ms", "max_delay_ms"):
        # getattr(retry, field_name) is equivalent to C# Reflection:
        # retry.GetType().GetProperty(field_name).GetValue(retry)
        value = cast(object, getattr(retry, field_name))
        if value is None:
            continue
        if not _is_valid_retry_numeric(value):
            raise CredentialError(
                f"{operation}() retry configuration contains an invalid {field_name} value",
                retryable=False,
            )


def _validate_retryable_server_error_codes(
    retry: object,
    operation: str,
) -> None:
    """Validates the specific list of HTTP server error statuses
    (like 429 Too Many Requests) we are allowed to retry."""
    # getattr(retry, "retry_on_status_codes") is equivalent to C# Reflection:
    # retry.GetType().GetProperty("retry_on_status_codes").GetValue(retry)
    status_codes = cast(object, getattr(retry, "retry_on_status_codes", None))
    if status_codes is None:
        return
    if not isinstance(status_codes, (tuple, list)):
        raise CredentialError(
            f"{operation}() retry configuration contains invalid retry_on_status_codes",
            retryable=False,
        )

    normalized_status_codes = cast(tuple[object, ...] | list[object], status_codes)
    for code in normalized_status_codes:
        if isinstance(code, bool) or not isinstance(code, int):
            raise CredentialError(
                f"{operation}() retry configuration contains invalid retry_on_status_codes",
                retryable=False,
            )


def _merge_client_workload_details(
    identity: ClientWorkloadDetails,
    additional_details: ClientWorkloadDetails | None,
) -> ClientWorkloadDetails:
    if additional_details is None:
        return identity

    return _merge_mappings(identity, additional_details)


def _merge_mappings(
    base: Mapping[str, JsonValue],
    overlay: Mapping[str, JsonValue],
) -> ClientWorkloadDetails:
    merged: dict[str, JsonValue] = dict(base)

    for key, overlay_value in overlay.items():
        base_value = merged.get(key)
        if _is_json_mapping_value(base_value) and _is_json_mapping_value(overlay_value):
            merged[key] = _merge_mappings(base_value, overlay_value)
            continue

        if key not in merged:
            merged[key] = overlay_value

    return cast(ClientWorkloadDetails, merged)


_T = TypeVar("_T")


# slots=True disables the dynamic attribute dictionary __dict__,
# optimizing memory and restricting attributes
@dataclass(slots=True)
class _InFlight(Generic[_T]):
    # Event is used for thread synchronization
    done: Event = field(default_factory=Event)
    result: _T | None = None
    error: Exception | None = None


def _is_valid_retry_numeric(value: object) -> bool:
    return not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value)


# TypeGuard tells the type checker that if this returns True,
# the type is guaranteed to be Mapping[str, JsonValue]
def _is_json_mapping_value(value: JsonValue | None) -> TypeGuard[Mapping[str, JsonValue]]:
    return isinstance(value, Mapping)


def _normalize_client_workload_details(
    additional_details: object,
) -> ClientWorkloadDetails | None:
    if additional_details is None:
        return None

    return _sanitize_workload_data(
        additional_details,
        error_factory=lambda: CredentialError(
            "client_workload_details must be a JSON object",
            retryable=False,
        ),
    )


def _sanitize_workload_data(
    value: object,
    *,
    error_factory: Callable[[], Exception],
) -> ClientWorkloadDetails:
    if not isinstance(value, Mapping):
        raise error_factory()
    mapping = cast(Mapping[object, object], value)

    normalized: dict[str, JsonValue] = {}
    for key, item in mapping.items():
        if not isinstance(key, str):
            raise error_factory()
        normalized[key] = _normalize_json_value(item, error_factory=error_factory)

    return cast(ClientWorkloadDetails, normalized)


def _normalize_json_value(
    value: object,
    *,
    error_factory: Callable[[], Exception],
) -> JsonValue:
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            raise error_factory()
        return value
    if isinstance(value, Mapping):
        return _sanitize_workload_data(
            cast(Mapping[object, object], value),
            error_factory=error_factory,
        )
    if isinstance(value, list):
        sequence = cast(list[object], value)
        return [_normalize_json_value(item, error_factory=error_factory) for item in sequence]
    if isinstance(value, tuple):
        tuple_sequence = cast(tuple[object, ...], value)
        return tuple(
            _normalize_json_value(item, error_factory=error_factory) for item in tuple_sequence
        )

    raise error_factory()


def _verify_credential_request_parameters(
    request: object,
    options: object,
) -> tuple[GetCredentialInput, GetCredentialOptions | None]:
    if not isinstance(request, GetCredentialInput):
        raise CredentialError("get_credential() requires a valid input object", retryable=False)
    if options is not None and not isinstance(options, GetCredentialOptions):
        raise CredentialError("get_credential() options must be an object", retryable=False)
    return request, options


def _validate_single_flight_key_factory(
    factory: object,
    provider_id: str,
) -> None:
    """Verifies that the trust provider's single-flight key generator is callable."""
    if not callable(factory):
        raise TrustProviderError(
            f"Trust Provider '{provider_id}' returned invalid identity data",
            retryable=False,
        )


def _validate_resolved_single_flight_key(
    key: object,
    provider_id: str,
) -> None:
    """Verifies that the generated single-flight key is a valid string if defined."""
    if key is not None and not isinstance(key, str):
        raise TrustProviderError(
            f"Trust Provider '{provider_id}' returned invalid identity data",
            retryable=False,
        )
