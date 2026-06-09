# Issue Summary: `@tavily/core` Import Not Recognized

## Problem

In `backend/index.ts`, the import line:

```ts
import { tavily } from '@tavily/core'
```

was showing an error even after installing the package with Bun.

## Root cause

The package installation ended up outside the `backend` folder, at the repository root:

- `d:\Projects\data-extractor\node_modules`

but the file being edited is in:

- `d:\Projects\data-extractor\backend`

That means TypeScript or VS Code may not have resolved the module from the correct `node_modules` location.

## What happened

- `bun add @tavily/core` was attempted from the `backend` folder, but earlier Bun was not available on PATH.
- The package was later installed successfully using the local Bun executable from a different working directory.
- As a result, Bun placed dependency data where the active editor/TypeScript server did not expect it.

## Solution

### 1. Use the correct folder context

Run Bun commands from inside the `backend` folder if you want dependencies installed there:

```powershell
cd d:\Projects\data-extractor\backend
.\bun.exe install
# or to add just tavily
.\bun.exe add @tavily/core
```

### 2. If using root-level `node_modules`

Open the repository root (`d:\Projects\data-extractor`) in VS Code so module resolution can find packages installed at the root.

### 3. Refresh VS Code/TypeScript server

After installing packages, restart the TypeScript server or reload VS Code:

- Command Palette → `TypeScript: Restart TS Server`
- Or use `Developer: Reload Window`

## Notes

- `.un.exe` tells PowerShell to run the local Bun executable from the current folder.
- `&` is PowerShell's call operator, useful when the executable path contains spaces or special syntax.
- If the package is correctly installed and VS Code still shows an error, the editor usually just needs to reload.

## Result

With the package installed in the correct location and the editor refreshed, the `import { tavily } from '@tavily/core'` line should resolve correctly.
