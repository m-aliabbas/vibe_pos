# VibePOS Desktop - Tauri Application

A modern Point of Sale (POS) desktop application built with **Tauri** and **Next.js**.

## What is Tauri?

Tauri is a framework for building desktop applications using web technologies. Unlike Electron, Tauri:
- Uses the system's native webview instead of bundling Chromium
- Results in **much smaller bundle sizes** (~600KB vs Electron's ~120MB)
- Provides **better security** with a Rust-based backend
- Has **lower memory footprint** and faster startup times

## Architecture

This application uses a **sidecar approach** for Next.js SSR:
- **Development**: Tauri connects to Next.js dev server on `localhost:3000`
- **Production**: Tauri bundles the **Node.js binary** as a sidecar and the Next.js standalone build as resources.
- **Startup**: Rust binary spawns the Node.js sidecar on a random port and connects the webview to it.
- **Communication**: Tauri window loads from localhost, uses Tauri APIs for native features

## Prerequisites

### 1. Install Rust

Tauri requires Rust to be installed. Install it using rustup:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

After installation, restart your terminal or run:
```bash
source $HOME/.cargo/env
```

Verify installation:
```bash
rustc --version
cargo --version
```

### 2. Install System Dependencies (macOS)

```bash
# Install Xcode Command Line Tools (if not already installed)
xcode-select --install
```

### 3. Install Node.js Dependencies

```bash
npm install
```

## Development

### Running the Application

You need **two terminal windows**:

**Terminal 1** - Start Next.js dev server:
```bash
npm run dev
```

**Terminal 2** - Start Tauri (after Next.js is running):
```bash
npm run tauri:dev
```

The Tauri window will open and connect to your Next.js application at `http://localhost:3000`.

### Alternative: Single Command (Coming Soon)

We can configure Tauri to automatically start the Next.js server, but for now, run them separately.

## Building for Production

### Build the Desktop App

```bash
npm run tauri:build
```
Output: `src-tauri/target/release/bundle/dmg/*.dmg`

### Windows
Building for Windows requires a Windows environment (VM or Physical PC) or a CI/CD pipeline (like GitHub Actions).
1.  **Install Prerequisites**:
    - [Rust](https://www.rust-lang.org/tools/install)
    - [C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
    - [Node.js](https://nodejs.org/)
2.  **Run Build**:
    ```bash
    npm run tauri:build
    ```
Output: `src-tauri/target/release/bundle/msi/*.msi`

### Build Outputs

- **macOS**: `.app` bundle and `.dmg` installer in `src-tauri/target/release/bundle/macos/`
- **Windows**: `.exe` and `.msi` installer (when building on Windows)
- **Linux**: `.AppImage`, `.deb`, or `.rpm` (when building on Linux)

## Project Structure

```
frontend/
├── src-tauri/              # Tauri Rust backend
│   ├── src/
│   │   └── main.rs        # Rust entry point
│   ├── Cargo.toml         # Rust dependencies
│   ├── tauri.conf.json    # Tauri configuration
│   └── capabilities/      # Tauri permissions
├── app/                   # Next.js app directory
├── components/            # React components
├── lib/                   # Utilities
├── public/                # Static assets
├── package.json           # Node dependencies
└── next.config.ts         # Next.js config (standalone mode)
```

## Configuration

### Tauri Configuration

Edit `src-tauri/tauri.conf.json` to customize:
- Window size and title
- App identifier and version
- Security policies (CSP)
- Build settings

### Next.js Configuration

The `next.config.ts` is configured with `output: 'standalone'` which is required for Tauri production builds.

## Troubleshooting

### "Command not found: rustc"

Install Rust using the instructions in Prerequisites section above.

### "Failed to load URL"

Make sure Next.js dev server is running on `localhost:3000` before starting Tauri.

### Build Errors

1. Make sure all dependencies are installed: `npm install`
2. Clear Next.js cache: `rm -rf .next`
3. Clear Tauri cache: `rm -rf src-tauri/target`

## Migrated from Electron

This application was previously built with Electron. The migration to Tauri provides:
- ✅ 99% smaller bundle size
- ✅ Better security model
- ✅ Lower memory usage
- ✅ Faster startup times
- ✅ Same functionality with Next.js SSR

## Available Scripts

- `npm run dev` - Start Next.js development server
- `npm run build` - Build Next.js for production
- `npm run tauri:dev` - Start Tauri in development mode
- `npm run tauri:build` - Build production desktop app
- `npm run lint` - Run ESLint

## Learn More

- [Tauri Documentation](https://tauri.app/)
- [Next.js Documentation](https://nextjs.org/docs)
- [Tauri + Next.js Guide](https://tauri.app/v1/guides/getting-started/setup/next-js)
