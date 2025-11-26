# PowerShell script to convert IPC files from CommonJS to ES modules

$files = @(
  "src\main\ipc\semantic.ts",
  "src\main\ipc\settings.ts",
  "src\main\ipc\smartFolders.ts",
  "src\main\ipc\suggestions.ts",
  "src\main\ipc\analysis.ts",
  "src\main\ipc\files.ts",
  "src\main\ipc\index.ts"
)

foreach ($file in $files) {
  if (Test-Path $file) {
    Write-Host "Converting $file..."

    # Read the file
    $content = Get-Content $file -Raw

    # Convert requires to imports
    # Pattern 1: const { x, y } = require('...')
    $content = $content -replace "const \{ ([^\}]+) \} = require\('([^']+)'\);?", "import { `$1 } from '`$2';"

    # Pattern 2: const x = require('...')
    $content = $content -replace "const (\w+) = require\('([^']+)'\);?", "import `$1 from '`$2';"

    # Pattern 3: Multiple requires on one line
    $content = $content -replace "const ([^\s=]+) = require\('([^']+)'\);const", "import `$1 from '`$2';`nimport"

    # Convert module.exports
    # Pattern 1: module.exports = function
    $content = $content -replace "module\.exports = (function \w+)", "export `$1"

    # Pattern 2: module.exports = { ... }
    $content = $content -replace "module\.exports = \{([^\}]+)\};?", "export {`$1};"

    # Pattern 3: module.exports = value
    $content = $content -replace "module\.exports = (\w+);?", "export default `$1;"

    # Write back
    $content | Set-Content $file -NoNewline

    Write-Host "Converted $file"
  }
}

Write-Host "Conversion complete!"
