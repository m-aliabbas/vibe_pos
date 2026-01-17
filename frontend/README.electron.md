# POS System - Electron Desktop Application

This is a desktop application built with Next.js and Electron.

## Prerequisites

- Node.js (v18 or higher)
- Backend server running on `http://localhost:8000`

## Development

### Install Dependencies
```bash
npm install
```

### Run in Development Mode
This will start both Next.js dev server and Electron:
```bash
npm run electron:dev
```

The application will:
1. Start Next.js dev server on http://localhost:3000
2. Wait for the server to be ready
3. Launch Electron window

## Production Build

### Step 1: Build Next.js Application
```bash
npm run build
```

### Step 2: Build Electron Package

**For Current Platform:**
```bash
npm run electron:build
```

**For Specific Platforms:**

**macOS:**
```bash
npm run electron:build:mac
```

**Windows:**
```bash
npm run electron:build:win
```

**Linux:**
```bash
npm run electron:build:linux
```

The built application will be in the `dist` folder.

## Application Structure

```
frontend/
├── electron/
│   ├── main.js       # Electron main process (starts Next.js server)
│   └── preload.js    # Preload script for secure IPC
├── app/              # Next.js application
├── components/       # React components
├── public/           # Static assets
└── package.json      # Dependencies and scripts
```

## How It Works

### Development Mode
- Next.js runs as a dev server on port 3000
- Electron loads from http://localhost:3000
- Hot reload is available

### Production Mode
- Electron starts an embedded Next.js server
- Server runs on port 3000 internally
- All dynamic features work (API routes, SSR, etc.)

## Configuration

The application automatically handles:
- Starting Next.js server in production builds
- Loading from the correct URL in dev/prod
- Cleaning up the Next.js server when app closes

## Notes

- The backend API server must be running for the application to work properly
- Default backend URL is configured in `lib/api.ts`
- Window size: 1400x900 (minimum 1024x768)
- DevTools are automatically opened in development mode
- Application menu is removed for a cleaner interface

## Troubleshooting

### "Cannot find module" errors
Run `npm install` to ensure all dependencies are installed.

### Blank white screen
1. Make sure the backend server is running on http://localhost:8000
2. Check if port 3000 is available (not used by another process)
3. Wait a few seconds for Next.js server to start

### Build fails
- Ensure you have the latest Node.js version
- Clear `.next` directory: `rm -rf .next`
- Rebuild: `npm run build && npm run electron:build`

### Port 3000 already in use
Kill the process using port 3000:
```bash
# macOS/Linux
lsof -ti:3000 | xargs kill -9

# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

## Distribution

After building, you can distribute the application:
- **macOS**: `dist/POS System.dmg`
- **Windows**: `dist/POS System Setup.exe`
- **Linux**: `dist/POS System.AppImage`

## Running the Built App

To test the production build before distributing:

**macOS:**
```bash
open "dist/mac/POS System.app"
```

**Windows:**
```bash
dist\win-unpacked\POS System.exe
```

**Linux:**
```bash
./dist/linux-unpacked/pos-system
```
