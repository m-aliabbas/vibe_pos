# Manual Build Workflow

If you encounter missing module errors (like `No module named 'xyz'`), follow this guide to rebuild the application yourself.

## Prerequisites

1.  **Python 3.10+** environment active.
2.  **Dependencies Installed**:
    ```bash
    cd backend
    pip install -r requirements.txt
    pip install pyinstaller
    ```

## Step 1: Build the Python Backend

We use `pyinstaller` to bundle the Python app into a single file. I have created a script to make this easy.

1.  Open Terminal.
2.  Navigate to the `backend` folder:
    ```bash
    cd backend
    ```
3.  **Run the build script**:
    ```bash
    ./build_backend.sh
    ```

    *If you see an error about a missing module during runtime (e.g. `No module named 'pandas'`), open `build_backend.sh` and add another line: `--hidden-import=pandas`, then run the script again.*

## Step 2: Verify the Binary (Optional)

Before building the full app, you can test if the binary works:

1.  Run the generating binary:
    ```bash
    ./dist/backend-server
    ```
2.  It should say `Starting FastAPI server...`.
3.  Press `Ctrl+C` to stop it.

## Step 3: Build the Full App

Once the `backend-server` binary is created and copied (the script does this automatically), verify it is in the correct place:

-   **Check path**: `frontend/src-tauri/bin/backend-server-aarch64-apple-darwin`

Now build the Tauri application:

```bash
cd ../frontend
npm run tauri:build
```

## Step 4: Run the App

Open the generated app from:
`frontend/src-tauri/target/release/bundle/macos/POS System.app`
