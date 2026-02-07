import argparse
import base64
import json
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
    parser = argparse.ArgumentParser(description="Encrypt Firebase service account JSON.")
    parser.add_argument("--input", required=True, help="Path to service account JSON")
    parser.add_argument("--output", required=True, help="Path to write encrypted file")
    parser.add_argument("--key", help="Fernet key. If omitted, a new key is generated.")
    parser.add_argument(
        "--print",
        dest="print_decrypted",
        action="store_true",
        help="Decrypt input and print to stdout (use with --key).",
    )
    args = parser.parse_args()

    key = args.key or generate_key()

    if args.print_decrypted:
        decrypt_to_stdout(Path(args.input), key)
        return

    encrypt_keyfile(Path(args.input), Path(args.output), key)
    print("Encrypted file written.")
    if not args.key:
        print("Fernet key (store in FIREBASE_CREDENTIALS_KEY):")
        print(key)


if __name__ == "__main__":
    main()
