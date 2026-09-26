from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class CustomerIdentityService(Protocol):
    def get_customer_identity(self, customer_id: int) -> object: ...


@runtime_checkable
class PaymentService(Protocol):
    def record_payment(self, command: object) -> object: ...


@runtime_checkable
class InvoiceRenderer(Protocol):
    def render_invoice(self, document: object, *, format_name: str) -> bytes: ...


@runtime_checkable
class PrintService(Protocol):
    def print_document(self, document: bytes, *, printer_name: str | None = None) -> None: ...


@runtime_checkable
class ReportingService(Protocol):
    def run_report(self, report_id: str, filters: object) -> object: ...


@runtime_checkable
class PermissionService(Protocol):
    def is_allowed(self, actor: object, permission: str) -> bool: ...


@runtime_checkable
class AuditLog(Protocol):
    def append(self, event_type: str, safe_payload: dict[str, object]) -> None: ...
