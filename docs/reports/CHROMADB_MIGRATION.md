> **[HISTORICAL REPORT]**
>
> This document is a historical development report capturing work completed during a specific
> session. For current documentation, see the main [README.md](../../README.md) or [docs/](../)
> directory.
>
> ---

# ChromaDB Migration & Startup Notes

The old `npx chromadb run` flow broke because the npm `chromadb` package ships **no CLI**.
StratoSort now launches the official Python server (`python -m chromadb run ...`) and exposes clear
hooks to customise or disable the service.

## ✅ Fast setup

1. Install Python 3.10+ and the Chroma package:

   ```powershell
   py -3 -m pip install --upgrade pip
   py -3 -m pip install chromadb
   ```

   ```bash
   # macOS / Linux
   python3 -m pip install --upgrade pip
   python3 -m pip install chromadb
   ```

2. Start StratoSort. The app will automatically run:

   ```powershell
   py -3 -m chromadb run --path %APPDATA%\stratosort\chromadb --host 127.0.0.1 --port 8000
   ```

3. Already running your own Chroma server? Set `CHROMA_SERVER_URL=http://host:port` so StratoSort
   connects instead of spawning.

## What changed in the codebase

| Area                      | Update                                                                                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ChromaDBService`         | Tracks `serverUrl`, `host`, `port` and exposes `getServerConfig()` so the launcher + client stay in sync.                                                               |
| `ensureChromaDbRunning()` | Tries a custom command, then a local CLI (future support), then the Python fallback. Logs stderr so misconfigurations are visible.                                      |
| Environment guards        | `STRATOSORT_DISABLE_CHROMADB=1` skips startup; `CHROMA_SERVER_COMMAND` lets you provide an exact command; `CHROMA_SERVER_URL`/`HOST`/`PORT` override the target server. |

## Advanced configuration

| Variable                                                             | Description                                                                                              |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `CHROMA_SERVER_URL`                                                  | Full URL such as `http://192.168.1.20:9000`. Parsed to derive host/port for CLI args.                    |
| `CHROMA_SERVER_HOST`, `CHROMA_SERVER_PORT`, `CHROMA_SERVER_PROTOCOL` | Lower-level knobs if you just need to tweak one value.                                                   |
| `CHROMA_SERVER_COMMAND`                                              | Run a custom command (e.g. `"C:\Python312\python.exe" -m chromadb run --path ...`). Quotes are honoured. |
| `STRATOSORT_DISABLE_CHROMADB`                                        | Set to `1` to skip all vector DB startup logic (semantic features will remain disabled).                 |

## Manual verification checklist

1. Start the server yourself:

   ```powershell
   py -3 -m chromadb run --path %APPDATA%\stratosort\chromadb --host 127.0.0.1 --port 8000
   ```

   ```bash
   python3 -m chromadb run --path ~/.config/stratosort/chromadb --host 127.0.0.1 --port 8000
   ```

2. Hit the health endpoint:

   ```powershell
   curl http://127.0.0.1:8000/api/v2/heartbeat
   ```

3. Launch StratoSort → look for `[ChromaDB] Server heartbeat successful` in the console.

## Troubleshooting

- **`ModuleNotFoundError: No module named 'chromadb'`**  
  Install the package for the exact interpreter the launcher resolved (usually
  `py -3 -m pip install chromadb` on Windows).

- **`python`/`py` command not found**  
  Install Python from https://python.org, restart the shell, or point `CHROMA_SERVER_COMMAND` to the
  full interpreter path.

- **Need a different host/port**  
  Set `CHROMA_SERVER_URL` (or the HOST/PORT envs). The spawn arguments and client URL will
  automatically align.

- **Want to disable Chroma temporarily**  
  Export `STRATOSORT_DISABLE_CHROMADB=1`. The UI will continue working; semantic search just stays
  inactive.

- **Still seeing stderr noise**  
  Check the logged lines right after `[ChromaDB] server stderr:`. They usually contain the Python
  error (missing dependency, port in use, etc.).

## Summary

- ❌ Removed reliance on a non-existent Node CLI.
- ✅ Added Python fallback with better logging and configurability.
- ✅ Documented install steps + environment overrides so Windows/macOS/Linux setups are predictable.

Keep this document handy—any time the log says
`[ChromaDB] Unable to locate a suitable startup command`, follow the steps above to finish
provisioning the local Chroma server.
