from __future__ import annotations

import ast
import json
import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
ENDPOINT_ROOT = BACKEND_ROOT / "app" / "api" / "v1" / "endpoints"
CONTRACT_PATH = Path(__file__).resolve().parent / "contracts" / "retail_api_v1.json"


def declared_router_operations(module_path: Path) -> set[tuple[str, str]]:
    tree = ast.parse(module_path.read_text(encoding="utf-8"), filename=str(module_path))
    operations: set[tuple[str, str]] = set()

    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for decorator in node.decorator_list:
            if not isinstance(decorator, ast.Call):
                continue
            function = decorator.func
            if not isinstance(function, ast.Attribute):
                continue
            if not isinstance(function.value, ast.Name) or function.value.id != "router":
                continue
            if not decorator.args or not isinstance(decorator.args[0], ast.Constant):
                continue
            path = decorator.args[0].value
            if isinstance(path, str):
                operations.add((function.attr.lower(), path))
    return operations


class ApiContractSnapshotTests(unittest.TestCase):
    def test_critical_routes_remain_declared(self) -> None:
        contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
        operations_by_module: dict[str, set[tuple[str, str]]] = {}

        for route in contract["critical_routes"]:
            module = route["module"]
            if module not in operations_by_module:
                operations_by_module[module] = declared_router_operations(ENDPOINT_ROOT / module)

            expected = (route["method"], route["path"])
            self.assertIn(
                expected,
                operations_by_module[module],
                f"Critical route {expected} is missing from {module}",
            )


if __name__ == "__main__":
    unittest.main()
