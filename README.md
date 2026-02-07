# VibePOS

## Backend: Firebase credentials (encrypted)

This project supports loading Firebase service account credentials from an encrypted file so the plaintext JSON never needs to be committed.

### 1) Encrypt your service account JSON

Run from the backend folder:



- `python scripts/secure_firebase_key.py --input k1.json --output k1.json.enc`

This prints a Fernet key. Store it securely (do not commit it).

### 2) Set environment variables

Set these in your `.env` (or export in your shell):

- `FIREBASE_CREDENTIALS_ENC_PATH=./k1.json.enc`
- `FIREBASE_CREDENTIALS_KEY=<your_fernet_key>`

Optional (collection name):

- `FIREBASE_LICENSE_COLLECTION=lisence_pos`

### 3) Remove plaintext JSON

Delete `backend/k1.json` after encryption. It is already ignored in `.gitignore`.

### 4) Run backend

From `backend/`:

- `python run_server.py`

## Notes

- If Firestore is not created for the project linked to your service account, the app will fail during license check. Create Firestore (default) in the Firebase project first.
- To bypass license checks locally, set `LICENSE_ENFORCEMENT=false` in `.env`.
