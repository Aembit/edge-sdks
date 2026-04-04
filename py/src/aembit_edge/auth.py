"""Public authentication result types."""

from dataclasses import dataclass


@dataclass(slots=True, kw_only=True)
class AuthSession:
    """Authentication state returned by :meth:`aembit_edge.EdgeClient.authenticate`."""

    expires_at: str | None
    trust_provider_id: str
