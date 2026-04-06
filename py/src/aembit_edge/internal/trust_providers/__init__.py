"""Internal Trust Provider helpers."""

from .aws_role import (
    AwsCredentialIdentity,
    AwsRoleSignedRequestData,
    build_aws_sts_get_caller_identity_signed_data,
)

__all__ = [
    "AwsCredentialIdentity",
    "AwsRoleSignedRequestData",
    "build_aws_sts_get_caller_identity_signed_data",
]
