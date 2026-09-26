from __future__ import annotations

from dataclasses import dataclass

from app.platform.identifiers import SharedPackageId


PLATFORM_SHARED_PACKAGE_VERSIONS: dict[SharedPackageId, str] = {
    SharedPackageId.CUSTOMER_IDENTITY: "1.0.0",
    SharedPackageId.PAYMENTS: "1.0.0",
    SharedPackageId.INVOICES: "1.0.0",
    SharedPackageId.PRINTING: "1.0.0",
    SharedPackageId.REPORTING: "1.0.0",
    SharedPackageId.PERMISSIONS: "1.0.0",
    SharedPackageId.AUDIT: "1.0.0",
}


class IncompatibleSharedPackageError(RuntimeError):
    pass


def _version_tuple(value: str) -> tuple[int, int, int]:
    try:
        pieces = tuple(int(piece) for piece in value.split("."))
    except ValueError as exc:
        raise ValueError(f"Invalid semantic version: {value!r}") from exc
    if len(pieces) != 3:
        raise ValueError(f"Semantic version must contain major.minor.patch: {value!r}")
    return pieces


@dataclass(frozen=True)
class PackageRequirement:
    minimum: str
    maximum_exclusive: str

    def accepts(self, version: str) -> bool:
        parsed = _version_tuple(version)
        return _version_tuple(self.minimum) <= parsed < _version_tuple(
            self.maximum_exclusive
        )


def validate_package_requirements(
    requirements: dict[SharedPackageId, PackageRequirement],
) -> None:
    for package_id, requirement in requirements.items():
        installed = PLATFORM_SHARED_PACKAGE_VERSIONS.get(package_id)
        if installed is None or not requirement.accepts(installed):
            raise IncompatibleSharedPackageError(
                f"Application requires {package_id.value}>={requirement.minimum},"
                f"<{requirement.maximum_exclusive}; installed={installed or 'missing'}"
            )
