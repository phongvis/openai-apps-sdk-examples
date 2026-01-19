import React from 'react';
import { MEDIAN_INDUSTRY_SCORES, MEDIAN_SCORES } from './medianScores';
import { getComparisonDescriptor } from './scoreComparison';

const descriptorColor = {
  'is significantly above': 'var(--color-green-600)',
  'is above': 'var(--color-green-500)',
  matches: 'var(--color-text-secondary)',
  'is below': 'var(--color-yellow-600)',
  'falls significantly below': 'var(--color-red-600)',
};

const formatIndustryName = (industryRaw) => {
  return industryRaw
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const HeadlineAnalysis = ({ scores, inputLabel, industry }) => {
  if (!Array.isArray(scores) || scores.length === 0) {
    return null;
  }

  const normalizedIndustry = industry?.toLowerCase();
  const baseline =
    normalizedIndustry && normalizedIndustry !== 'irrelevance'
      ? MEDIAN_INDUSTRY_SCORES[normalizedIndustry] || MEDIAN_SCORES
      : MEDIAN_SCORES;

  const overallScore = scores.find((score) => score.category === 'overall');
  const baselineOverall = baseline.find((score) => score.category === 'overall');

  if (!overallScore || !baselineOverall) {
    return null;
  }

  const descriptor = getComparisonDescriptor(
    overallScore.median_score,
    baselineOverall.median_score
  );

  const comparisonContext =
    normalizedIndustry && normalizedIndustry !== 'irrelevance'
      ? `domains in the ${formatIndustryName(normalizedIndustry)} industry`
      : "the internet's 400,000 most-visited domains";

  const resolvedLabel = inputLabel?.trim() || 'This domain';
  const color = descriptorColor[descriptor] || '#5f6368';

  return (
    <div className="security-headline">
      <p>
        <span className="security-headline__domain">{resolvedLabel}</span>
        &rsquo;s overall security posture{' '}
        <span className="security-headline__descriptor" style={{ color }}>
          {descriptor}
        </span>{' '}
        the median configuration of {comparisonContext}.
      </p>
    </div>
  );
};

export default HeadlineAnalysis;
