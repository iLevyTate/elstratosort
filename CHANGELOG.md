# Changelog

All notable changes to StratoSort will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Comprehensive test coverage for IPC handlers (settings.js, suggestions.js)
- SECURITY.md with vulnerability disclosure policy
- This CHANGELOG.md file

### Fixed

- Error handling in FloatingSearchContext useEffect
- ProcessingStateService timestamp updates on save
- ESLint warnings in test files

## [1.0.0] - 2024-12-XX

### Added

#### Core Features

- **AI-Powered Document Organization**: Local LLM analysis using Ollama (llama3.2, llava models)
- **Semantic Search**: Vector-based file search using ChromaDB embeddings
- **Smart Folders**: AI-suggested organization with pattern learning
- **Multi-modal Analysis**: Support for documents (PDF, Word, Excel), images, and code files
- **Batch Processing**: Organize multiple files simultaneously with progress tracking
- **Auto-Organization**: Watch folder monitoring (e.g., Downloads) for automatic sorting

#### User Interface

- Modern React UI with TailwindCSS styling
- Dark/Light/System theme support
- Floating search widget for quick file discovery
- Interactive graph visualization for file relationships
- Drag-and-drop file organization
- Keyboard shortcuts for common operations

#### Organization Intelligence

- Content-based file categorization
- Extension pattern matching
- User behavior learning from accepted suggestions
- Multiple organization strategies (by type, date, project, etc.)
- Confidence scoring for suggestions

#### Data Management

- Settings backup and restore functionality
- Settings import/export with validation
- Undo/redo system for file operations
- Analysis history caching for performance

#### Developer Experience

- Comprehensive test suite (76%+ coverage, 4800+ tests)
- ESLint and Prettier configuration
- CI/CD pipeline with GitHub Actions
- Extensive documentation

### Security

- Context isolation enabled for Electron renderer
- Input validation using Zod schemas
- Path sanitization to prevent traversal attacks
- Prototype pollution protection in settings import
- No external network requests (privacy-first design)

### Technical

- Electron 35+ with modern security defaults
- React 19 with Redux Toolkit for state management
- Webpack 5 build system with code splitting
- Jest and Playwright testing infrastructure
- Multi-platform builds (Windows, macOS, Linux)

---

## Version History Format

### Types of Changes

- **Added**: New features
- **Changed**: Changes to existing functionality
- **Deprecated**: Features that will be removed in future versions
- **Removed**: Features that have been removed
- **Fixed**: Bug fixes
- **Security**: Security-related changes

[Unreleased]: https://github.com/stratosort/stratosort/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/stratosort/stratosort/releases/tag/v1.0.0
