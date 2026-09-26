#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
from pathlib import Path

from app.core.config import Settings
from app.db.base import Base
from app.db.providers import create_provider
from app.db.transfer import transfer_database


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verified VibePOS provider-to-provider transfer")
    parser.add_argument("--source-provider", required=True, choices=("sqlite", "postgresql", "mysql"))
    parser.add_argument("--source-url", default=os.environ.get("VIBEPOS_SOURCE_DATABASE_URL"))
    parser.add_argument("--target-provider", required=True, choices=("sqlite", "postgresql", "mysql"))
    parser.add_argument("--target-url", default=os.environ.get("VIBEPOS_TARGET_DATABASE_URL"))
    parser.add_argument("--data-dir", required=True)
    parser.add_argument("--confirm", required=True, help="Exact value, for example sqlite->postgresql")
    args = parser.parse_args()
    if not args.source_url or not args.target_url:
        parser.error(
            "source and target URLs are required via VIBEPOS_SOURCE_DATABASE_URL / "
            "VIBEPOS_TARGET_DATABASE_URL (recommended) or --source-url / --target-url"
        )
    return args


def configured_settings(provider: str, url: str, data_dir: str) -> Settings:
    return Settings(
        _env_file=None,
        DATA_DIR=data_dir,
        DATABASE_PROVIDER=provider,
        DATABASE_URL=url,
        DATABASE_MAINTENANCE_MODE=True,
        LICENSE_ENFORCEMENT=False,
    )


def main() -> None:
    args = parse_args()
    source = create_provider(configured_settings(args.source_provider, args.source_url, args.data_dir))
    target = create_provider(configured_settings(args.target_provider, args.target_url, args.data_dir))
    source_engine = source.create_engine()
    target_engine = target.create_engine()
    try:
        result = transfer_database(
            source,
            source_engine,
            target,
            target_engine,
            Base.metadata,
            confirmation=args.confirm,
            backup_directory=Path(args.data_dir).resolve().parent / "backups" / "transfers",
        )
        print(f"Transfer verified. Source backup: {result.backup_path}")
        print(f"Copied rows: {result.copied_rows}")
    finally:
        source_engine.dispose()
        target_engine.dispose()


if __name__ == "__main__":
    main()
