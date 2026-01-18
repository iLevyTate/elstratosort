function buildLogMeta({ component, operation, ...details } = {}) {
  return {
    component,
    operation,
    timestamp: new Date().toISOString(),
    ...details
  };
}

module.exports = {
  buildLogMeta
};
