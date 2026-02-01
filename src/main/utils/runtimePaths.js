const path = require('path');
const fs = require('fs');

function resolveRuntimeRoot() {
  const override = process.env.STRATOSORT_RUNTIME_DIR;
  if (override && override.trim()) {
    return override.trim();
  }

  const resourcesCandidate = process.resourcesPath
    ? path.join(process.resourcesPath, 'assets', 'runtime')
    : null;
  const devCandidate = path.resolve(__dirname, '../../../assets/runtime');

  if (
    resourcesCandidate &&
    typeof fs.existsSync === 'function' &&
    fs.existsSync(resourcesCandidate)
  ) {
    return resourcesCandidate;
  }

  return devCandidate;
}

function resolveRuntimePath(...segments) {
  return path.join(resolveRuntimeRoot(), ...segments);
}

module.exports = {
  resolveRuntimeRoot,
  resolveRuntimePath
};
