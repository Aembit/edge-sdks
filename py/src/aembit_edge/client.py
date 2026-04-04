"""Public sync client API."""

from .auth import AuthSession
from .config import EdgeClientConfig
from .credentials import CredentialResult, GetCredentialInput, GetCredentialOptions


class EdgeClient:
    """High-level sync SDK client for authentication and credential retrieval."""

    def __init__(self, config: EdgeClientConfig) -> None:
        self._config = config

    @property
    def config(self) -> EdgeClientConfig:
        """Return the client configuration used to construct this instance."""

        return self._config

    def authenticate(self) -> AuthSession:
        """Authenticate the configured workload.

        This public API shape is stable, but the sync client implementation is
        still in progress.
        """

        raise NotImplementedError("EdgeClient.authenticate() is not implemented yet")

    def get_credential(
        self,
        request: GetCredentialInput,
        options: GetCredentialOptions | None = None,
    ) -> CredentialResult:
        """Retrieve credentials for a target server.

        This public API shape is stable, but the sync client implementation is
        still in progress.
        """

        del request, options
        raise NotImplementedError("EdgeClient.get_credential() is not implemented yet")
