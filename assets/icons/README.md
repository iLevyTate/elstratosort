# StratoSort Application Icons

This directory should contain platform-specific application icons for building the app.

## Required Icon Files:

### **Windows**
- `win/icon.ico` - Windows application icon (256x256, 128x128, 64x64, 48x48, 32x32, 16x16)

### **macOS** 
- `mac/icon.icns` - macOS application icon (1024x1024 down to 16x16)

### **Linux**
- `icon.png` - Linux application icon (512x512 recommended)

## Icon Generation

Icons are automatically generated from the source logo (`assets/stratosort-logo.png`) using the built-in generation scripts:

```bash
# Generate all icons for all platforms
npm run generate:icons

# Or generate all assets (icons + installer graphics)
npm run generate:assets
```

The generation script (`scripts/generate-icons.js`) creates:
- Windows ICO file (multi-resolution: 16px to 256px)
- macOS ICNS file (all required sizes including Retina @2x variants)
- Linux PNG files (16px to 1024px)
- Favicon files for web usage

## Current Status

Icons are auto-generated during `npm install` (postinstall hook) and before production builds.

## Manual Regeneration

If you update the source logo (`assets/stratosort-logo.png`), regenerate icons by running:

```bash
npm run generate:icons
``` 