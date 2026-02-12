<p align="center">
  <img src="assets/stratosort-logo.png" alt="StratoSort Logo" width="128" />
</p>

<h1 align="center">StratoSort</h1>

<p align="center">
  <strong>Intelligent File Organization with Privacy-First Local AI</strong>
</p>

<p align="center">
  <a href="https://github.com/iLevyTate/elstratosort/releases"><img src="https://img.shields.io/badge/version-1.2.2-blue?style=flat-square" alt="Version" /></a>
  <a href="https://github.com/iLevyTate/elstratosort/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Personal_Use_Only-blue?style=flat-square" alt="License" /></a>
  <a href="https://github.com/iLevyTate/elstratosort/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/iLevyTate/elstratosort/ci.yml?style=flat-square&label=CI" alt="CI Status" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=flat-square" alt="Platform" />
  <img src="https://img.shields.io/badge/electron-40+-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/node-18+-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square" alt="PRs Welcome" />
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#documentation">Documentation</a> •
  <a href="#contributing">Contributing</a> •
  <a href="CHANGELOG.md">Changelog</a>
</p>

---

**StratoSort** transforms file chaos into intelligent order using privacy-first local AI. It
automatically categorizes, tags, and organizes your documents completely offline—leveraging
**Ollama** for intelligence and **ChromaDB** for semantic search—ensuring your data never leaves
your machine.

## Project Naming Clarification

To keep naming clear for current users and existing forks:

- **`elstratosort` (this repository)** is the current production app and remains the canonical repo.
- **StratoSort Stack / StratoStack** refers to the full app stack in this repo (Electron app + local
  AI runtime integrations).
- **StratoSort Core / StratoCore** refers to a planned future repository for extracted core
  components. It is not this repository.

If you see older branch notes that mention "v2" or migration experiments, treat them as in-progress
history rather than a repo rename.

## Demo

<p align="center">
  <strong>See StratoSort in action</strong>
</p>

> **Desktop:** Video plays directly below | **Mobile:** Click the filename to watch

https://github.com/user-attachments/assets/7cd1f974-33cb-4d2d-ac8d-ea30c015389b

## What's New in v1.2.2

- **UI Consistency Pass** — Standardized typography, spacing tokens, and button styles across all
  views
- **Search and Graph Polish** — Unified metadata labels, banners, and empty states
- **Organize UX Fix** — Restored missing button import to prevent ReadyFileItem crash
- **Modal and Loading UI** — Aligned modal descriptions and loading text with shared Typography
  system

See **[CHANGELOG.md](CHANGELOG.md)** for complete release notes.

## Features

| Feature                   | Description                                                                         |
| :------------------------ | :---------------------------------------------------------------------------------- |
| **Local AI Intelligence** | Powered by Ollama (LLMs + Vision) to understand file content, not just filenames    |
| **Privacy-First Design**  | Zero data exfiltration. All processing happens locally on your device               |
| **Smart Folder Watcher**  | Real-time monitoring that automatically analyzes and sorts new files as they arrive |
| **Image Understanding**   | Vision models and OCR categorize screenshots, photos, and scanned documents         |
| **Knowledge Graph**       | Interactive visualization of file relationships, clusters, and semantic connections |
| **Semantic Search**       | Find files by meaning using Vector Search and AI Re-Ranking                         |
| **Safe Operations**       | Full Undo/Redo capability for all file moves and renames                            |

## Quick Start

### Prerequisites

| Requirement          | Specification                                                      |
| :------------------- | :----------------------------------------------------------------- |
| **Operating System** | Windows 10/11 (recommended), macOS 10.15+, or Linux                |
| **Memory**           | 8GB RAM minimum recommended                                        |
| **Dependencies**     | [Ollama](https://ollama.ai) (required), Python 3.9+ (for ChromaDB) |

> **Note:** Windows installer can bundle portable Ollama + embeddable Python. The app handles
> installation automatically on first run—no CLI required.

### Installation

```bash
git clone https://github.com/iLevyTate/elstratosort.git
cd elstratosort
npm ci
npm run dev
```

**First Launch:** The app guides you through Ollama setup, AI model downloads, and vector database
installation.

### Platform-Specific Setup

<details>
<summary><strong>Windows</strong></summary>

Fully bundled AI runtime with zero CLI required:

- Portable Ollama + embeddable Python + Tesseract staged during packaging via
  `npm run setup:runtime`
- Click **"Install All (Background)"** on first launch
- No admin prompts required; models download on first use

</details>

<details>
<summary><strong>macOS</strong></summary>

Uses system dependencies:

- Requires Python 3.9+ and Homebrew/manual Ollama installation
- **"Install All"** guides you through setup; Homebrew may prompt for permissions
- Tesseract auto-installs via Homebrew with built-in OCR fallback
- Models download on first use

</details>

<details>
<summary><strong>Linux</strong></summary>

Standard package manager installation:

- Install Ollama, Python 3.9+, and Tesseract via your distribution's package manager
- Follow the in-app **"Install All"** wizard for guided setup
- Models download on first use

</details>

> **Development Note:** StratoSort is developed with a Windows-first approach. While releases are
> published for all major platforms, Windows receives the most comprehensive testing.

For detailed instructions, see the **[Getting Started Guide](docs/GETTING_STARTED.md)**.

## Advanced Capabilities

### Smart Folders and Watchers

Define categories with natural language descriptions. The Smart Folder Watcher monitors your
downloads or designated folders, automatically analyzing new items and routing them based on content
understanding.

### Vision and OCR

StratoSort doesn't just read text files—it uses computer vision to interpret images and Tesseract
OCR to extract text, enabling automatic organization of receipts, screenshots, and scanned PDFs.

### Semantic Search and Re-Ranking

Search implies meaning. The built-in ReRanker Service uses a compact LLM to evaluate results,
surfacing conceptually relevant matches rather than simple keyword hits.

## Privacy and Security

| Principle                 | Implementation                                         |
| :------------------------ | :----------------------------------------------------- |
| **100% Local Processing** | No internet required after initial setup               |
| **Zero Telemetry**        | No data collection or tracking of any kind             |
| **Open Source**           | Full source code available for inspection              |
| **Secure by Default**     | Context isolation, input validation, path sanitization |

See **[SECURITY.md](SECURITY.md)** for the complete security policy.

## Documentation

| Document                                       | Description                      |
| :--------------------------------------------- | :------------------------------- |
| **[Getting Started](docs/GETTING_STARTED.md)** | Installation and setup guide     |
| **[Architecture](docs/ARCHITECTURE.md)**       | System design and data flow      |
| **[Learning Guide](docs/LEARNING_GUIDE.md)**   | Codebase onboarding              |
| **[Graph Features](docs/FEATURES_GRAPH.md)**   | Knowledge Graph capabilities     |
| **[IPC Contracts](docs/IPC_CONTRACTS.md)**     | IPC communication specifications |
| **[Release Guide](docs/RELEASING.md)**         | Release process and checks       |

## Contributing

Contributions are welcome. Please see **[CONTRIBUTING.md](CONTRIBUTING.md)** for guidelines.

1. Fork the repository
2. Create a feature branch
3. Make changes and verify with `npm test`
4. Submit a Pull Request

## Inspiration and Related Projects

StratoSort builds on ideas from the growing ecosystem of AI-powered file organization:

| Project                                                                       | Description                                                            |
| :---------------------------------------------------------------------------- | :--------------------------------------------------------------------- |
| **[llama-fs](https://github.com/iyaja/llama-fs)**                             | Self-organizing filesystem with Llama 3; pioneered watch mode learning |
| **[Local-File-Organizer](https://github.com/QiuYannnn/Local-File-Organizer)** | Privacy-first organizer using Llama3.2 and LLaVA                       |
| **[ai-file-sorter](https://github.com/hyperfield/ai-file-sorter)**            | Cross-platform desktop app with preview and undo                       |
| **[Hazel](https://www.noodlesoft.com/)**                                      | Industry standard Mac file automation                                  |
| **[Sparkle](https://makeitsparkle.co/)**                                      | Mac AI organizer using GPT-4/Gemini                                    |

## License

**StratoSort Personal Use License 1.0.0** (Based on PolyForm Noncommercial)

See **[LICENSE](LICENSE)** for details.

---

<p align="center">
  <a href="https://github.com/iLevyTate/elstratosort">GitHub</a> •
  <a href="https://github.com/iLevyTate/elstratosort/issues">Report Bug</a> •
  <a href="https://github.com/iLevyTate/elstratosort/issues">Request Feature</a>
</p>

<p align="center">
  Built with <a href="https://ollama.ai">Ollama</a> and <a href="https://www.trychroma.com">ChromaDB</a>
</p>
