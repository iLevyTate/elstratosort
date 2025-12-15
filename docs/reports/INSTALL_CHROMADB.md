> **[HISTORICAL REPORT]**
>
> This document is a historical development report capturing work completed during a specific
> session. For current documentation, see the main [README.md](../../README.md) or [docs/](../)
> directory.
>
> ---

# ChromaDB Installation Instructions

## Issue

StratoSort requires the ChromaDB Python module to enable semantic search and AI-powered file
organization features.

## Quick Fix

Open a command prompt or PowerShell and run:

```bash
py -3 -m pip install chromadb
```

Or if `py` command doesn't work:

```bash
python -m pip install chromadb
```

## Verification

After installation, restart StratoSort:

```bash
npm start
```

You should see:

```
[STARTUP] ChromaDB server started successfully
```

Instead of:

```
No module named chromadb
```

## Troubleshooting

If you see "py is not recognized":

1. Install Python 3.10 or later from python.org
2. During installation, check "Add Python to PATH"
3. Restart your terminal
4. Run the pip install command again

## What happens without ChromaDB?

The application will run in degraded mode:

- ✅ File browsing works
- ✅ Basic organization works
- ✅ Manual folder assignment works
- ❌ Semantic search disabled
- ❌ AI-powered smart folders disabled
- ❌ Similarity matching disabled
