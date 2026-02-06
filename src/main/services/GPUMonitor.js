// src/main/services/GPUMonitor.js

const { execFile } = require('child_process');
const { promisify } = require('util');
const { createLogger } = require('../../shared/logger');

const execFileAsync = promisify(execFile);

/**
 * Run a shell command asynchronously, returning stdout as string.
 * Swallows errors and returns null on failure.
 */
async function runCommand(cmd, args = [], options = {}) {
  try {
    const { stdout } = await execFileAsync(cmd, args, { timeout: 5000, ...options });
    return stdout;
  } catch {
    return null;
  }
}

const logger = createLogger('GPUMonitor');

class GPUMonitor {
  constructor() {
    this._platform = process.platform;
    this._gpuInfo = null;
  }

  /**
   * Detect GPU and get info
   */
  async detectGPU() {
    try {
      if (this._platform === 'darwin') {
        return this._detectMacGPU();
      } else if (this._platform === 'win32') {
        return this._detectWindowsGPU();
      } else {
        return this._detectLinuxGPU();
      }
    } catch (error) {
      logger.warn('[GPU] Detection failed', error);
      return { type: 'cpu', name: 'CPU (No GPU detected)' };
    }
  }

  async _detectMacGPU() {
    try {
      const output = await runCommand('system_profiler', ['SPDisplaysDataType', '-json']);
      if (!output) return { type: 'cpu', name: 'CPU' };
      const data = JSON.parse(output);
      const gpu = data.SPDisplaysDataType?.[0];

      if (gpu?.sppci_model?.toLowerCase().includes('apple')) {
        const memOutput = await runCommand('sysctl', ['hw.memsize']);
        const totalMem = parseInt(memOutput?.split(':')[1]?.trim()) || 0;
        const vramEstimate = Math.round(totalMem * 0.75);

        return {
          type: 'metal',
          name: gpu.sppci_model,
          vramBytes: vramEstimate,
          vramMB: Math.round(vramEstimate / 1024 / 1024),
          isAppleSilicon: true
        };
      }

      return {
        type: 'metal',
        name: gpu?.sppci_model || 'Unknown GPU',
        vramBytes: parseInt(gpu?.sppci_vram) * 1024 * 1024 || 0,
        vramMB: parseInt(gpu?.sppci_vram) || 0,
        isAppleSilicon: false
      };
    } catch {
      return { type: 'cpu', name: 'CPU' };
    }
  }

  async _detectWindowsGPU() {
    // Try nvidia-smi first
    const nvidiaSmi = await runCommand('nvidia-smi', [
      '--query-gpu=name,memory.total',
      '--format=csv,noheader,nounits'
    ]);
    if (nvidiaSmi) {
      const [name, vram] = nvidiaSmi
        .trim()
        .split(',')
        .map((s) => s.trim());
      return {
        type: 'cuda',
        name,
        vramBytes: parseInt(vram) * 1024 * 1024,
        vramMB: parseInt(vram)
      };
    }

    // Fall back to WMIC
    const wmic = await runCommand('wmic', [
      'path',
      'win32_VideoController',
      'get',
      'name,adapterram'
    ]);
    if (wmic) {
      const lines = wmic.trim().split('\n').slice(1);
      if (lines.length > 0) {
        const parts = lines[0].trim().split(/\s{2,}/);
        return {
          type: 'vulkan',
          name: parts[1] || 'Unknown GPU',
          vramBytes: parseInt(parts[0]) || 0,
          vramMB: Math.round(parseInt(parts[0]) / 1024 / 1024) || 0
        };
      }
    }

    return { type: 'cpu', name: 'CPU' };
  }

  async _detectLinuxGPU() {
    // Try nvidia-smi
    const nvidiaSmi = await runCommand('nvidia-smi', [
      '--query-gpu=name,memory.total',
      '--format=csv,noheader,nounits'
    ]);
    if (nvidiaSmi) {
      const [name, vram] = nvidiaSmi
        .trim()
        .split(',')
        .map((s) => s.trim());
      return {
        type: 'cuda',
        name,
        vramBytes: parseInt(vram) * 1024 * 1024,
        vramMB: parseInt(vram)
      };
    }

    // Try lspci for AMD/Intel
    const lspci = await runCommand('lspci', [], { shell: true });
    if (lspci) {
      const vgaLine = lspci.split('\n').find((l) => /vga/i.test(l));
      if (vgaLine) {
        return {
          type: 'vulkan',
          name: vgaLine.split(':').pop()?.trim() || 'Unknown GPU',
          vramBytes: 0,
          vramMB: 0
        };
      }
    }

    return { type: 'cpu', name: 'CPU' };
  }

  /**
   * Get current GPU memory usage (NVIDIA only)
   */
  async getGPUMemoryUsage() {
    if (this._platform !== 'win32' && this._platform !== 'linux') {
      // macOS doesn't have easy VRAM monitoring
      return null;
    }

    const output = await runCommand('nvidia-smi', [
      '--query-gpu=memory.used,memory.total',
      '--format=csv,noheader,nounits'
    ]);
    if (!output) return null;

    const [used, total] = output
      .trim()
      .split(',')
      .map((s) => parseInt(s.trim()));

    if (!used || !total) return null;

    return {
      usedMB: used,
      totalMB: total,
      percentUsed: Math.round((used / total) * 100)
    };
  }
}

// Singleton
let instance = null;
function getInstance() {
  if (!instance) {
    instance = new GPUMonitor();
  }
  return instance;
}

module.exports = { GPUMonitor, getInstance };
