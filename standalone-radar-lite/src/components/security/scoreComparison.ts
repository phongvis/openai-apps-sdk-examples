import { TrendComparison } from './TrendIndicator';

export type ComparisonDescriptor =
  | 'is significantly above'
  | 'is above'
  | 'matches'
  | 'is below'
  | 'falls significantly below';

export const getComparisonDescriptor = (
  value: number,
  median: number
): ComparisonDescriptor => {
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

export const getTrendComparison = (
  value: number,
  median: number
): TrendComparison => {
  const delta = value - median;

  if (delta > 0.02) {
    return 'above';
  }
  if (delta < -0.02) {
    return 'below';
  }
  return 'equal';
};
