# Fix malformed imports in IPC files

$files = @(
  "src\main\ipc\files.ts",
  "src\main\ipc\semantic.ts",
  "src\main\ipc\settings.ts",
  "src\main\ipc\smartFolders.ts"
)

foreach ($file in $files) {
  if (Test-Path $file) {
    Write-Host "Fixing $file..."

    $content = Get-Content $file -Raw

    # Fix: import x from 'y';.promises; -> import { promises as fs } from 'fs';
    $content = $content -replace "import fs from 'fs';\.promises;", "import { promises as fs } from 'fs';"

    # Fix: import x from 'y';import z from 'a'; -> Split into multiple lines
    $content = $content -replace "';import ", "'`r`nimport "

    # Fix remaining require statements
    $content = $content -replace "const \{([^\}]+)\} = require\('([^']+)'\);", "import {`$1} from '`$2';"

    # Fix named import issue: import { getInstance: getChromaDB } -> correct syntax
    # This is actually correct ES6 syntax, keep it

    # Fix function export
    $content = $content -replace "function (registerEmbeddingsIpc|registerFilesIpc)", "export function `$1"

    # Write back
    $content | Set-Content $file -NoNewline

    Write-Host "Fixed $file"
  }
}

Write-Host "Fix complete!"
