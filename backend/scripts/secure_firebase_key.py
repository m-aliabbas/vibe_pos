import argparse
import sys
from pathlib import Path

from cryptography.fernet import Fernet


def generate_key() -> str:
    return Fernet.generate_key().decode("utf-8")


def encrypt_keyfile(input_path: Path, output_path: Path, key: str) -> None:
    data = input_path.read_bytes()
    fernet = Fernet(key.encode("utf-8"))
    encrypted = fernet.encrypt(data)
    output_path.write_bytes(encrypted)


def decrypt_to_stdout(input_path: Path, key: str) -> None:
    encrypted = input_path.read_bytes()
    fernet = Fernet(key.encode("utf-8"))
    decrypted = fernet.decrypt(encrypted)
    print(decrypted.decode("utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser(description="Encrypt a JSON credential resource.")
    parser.add_argument("--input", required=True, help="Path to the source JSON")
    parser.add_argument("--output", required=True, help="Path to write encrypted file")
    parser.add_argument("--key", help="Fernet key. If omitted, a new key is generated.")
    parser.add_argument(
        "--use-shared-app-key",
        action="store_true",
        help="Use FIREBASE_CREDENTIALS_KEY from the backend application settings.",
    )
    parser.add_argument(
        "--print",
        dest="print_decrypted",
        action="store_true",
        help="Decrypt input and print to stdout (use with --key).",
    )
    args = parser.parse_args()

    if args.key and args.use_shared_app_key:
        parser.error("Use either --key or --use-shared-app-key, not both.")

    generated_key = not args.key and not args.use_shared_app_key
    key = args.key
    if args.use_shared_app_key:
        backend_dir = Path(__file__).resolve().parents[1]
        sys.path.insert(0, str(backend_dir))
        from app.core.config import settings

        key = settings.FIREBASE_CREDENTIALS_KEY
        if not key:
            parser.error("FIREBASE_CREDENTIALS_KEY is not configured.")
    key = key or generate_key()

    if args.print_decrypted:
        decrypt_to_stdout(Path(args.input), key)
        return

    encrypt_keyfile(Path(args.input), Path(args.output), key)
    print("Encrypted file written.")
    if generated_key:
        print("Fernet key (store in FIREBASE_CREDENTIALS_KEY):")
        print(key)


if __name__ == "__main__":
    main()
