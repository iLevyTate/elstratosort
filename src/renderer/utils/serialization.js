/**
 * Recursively serializes an object, converting Date objects to ISO strings.
 * Used to sanitize data before storing in Redux to avoid non-serializable value errors.
 */
export const serializeData = (data) => {
  if (data === null || data === undefined) return data;

  if (data instanceof Date) {
    return data.toISOString();
  }

  if (Array.isArray(data)) {
    return data.map(serializeData);
  }

  if (typeof data === 'object') {
    const serialized = {};
    Object.keys(data).forEach((key) => {
      serialized[key] = serializeData(data[key]);
    });
    return serialized;
  }

  return data;
};
