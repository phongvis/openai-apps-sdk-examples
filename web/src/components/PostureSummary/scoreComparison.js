export const getComparisonDescriptor = (value, median) => {
  const delta = value - median;

  if (delta >= 0.15) {
    return 'is significantly above';
  }
  if (delta >= 0.05) {
    return 'is above';
  }
  if (delta > -0.05) {
    return 'matches';
  }
  if (delta > -0.15) {
    return 'is below';
  }
  return 'falls significantly below';
};

export const getTrendComparison = (value, median) => {
  const delta = value - median;

  if (delta > 0.02) {
    return 'above';
  }
  if (delta < -0.02) {
    return 'below';
  }
  return 'equal';
};
