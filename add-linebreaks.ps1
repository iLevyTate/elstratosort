# Add linebreaks between import statements

$files = @(
  "src\main\ipc\files.ts",
  "src\main\ipc\semantic.ts",
  "src\main\ipc\settings.ts",
  "src\main\ipc\smartFolders.ts",
  "src\main\ipc\analysis.ts",
  "src\main\ipc\suggestions.ts",
  "src\main\ipc\index.ts"
)

foreach ($file in $files) {
  if (Test-Path $file) {
    Write-Host "Adding linebreaks to $file..."

    $content = Get-Content $file -Raw

    # Add linebreaks after ; before import
    $content = $content -replace ';import ', ";`nimport "

    # Add linebreaks after ; before export
    $content = $content -replace ';export ', ";`nexport "

    # Add linebreaks after } before import
    $content = $content -replace '\}import ', "}`nimport "

    # Write back
    $content | Set-Content $file -NoNewline

    Write-Host "Fixed $file"
  }
}

Write-Host "Linebreak fix complete!"
