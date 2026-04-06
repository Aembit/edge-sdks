"""Internal AWS Role Trust Provider helpers."""

from collections.abc import Mapping
from dataclasses import dataclass

from ...errors import TrustProviderError


@dataclass(slots=True, frozen=True)
class AwsRoleSignedRequestData:
    """Signed STS request data for `client.aws.stsGetCallerIdentity`."""

    headers: Mapping[str, object]
    region: str


def build_aws_sts_get_caller_identity_signed_data(*, region: str) -> AwsRoleSignedRequestData:
    """Build signed STS GetCallerIdentity request data.

    The concrete SigV4 implementation lands in the next step. The public
    Trust Provider surface can already depend on this stable internal entry
    point and tests can inject a signer directly.
    """

    raise TrustProviderError(
        (
            "AWS Role Trust Provider signing is not implemented yet. "
            "Inject a signer for tests or complete the signer implementation."
        ),
        retryable=False,
    )
