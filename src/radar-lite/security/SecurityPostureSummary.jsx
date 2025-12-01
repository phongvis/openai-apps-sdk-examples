import React, { useMemo, useState } from 'react';
import HexagonGraph from './HexagonGraph';
import HeadlineAnalysis from './HeadlineAnalysis';

const resolveIndustry = (result, fallbackIndustry) => {
  const candidate =
    result.industry ||
    result.metadata?.industry ||
    result.assessment?.industry ||
    fallbackIndustry ||
    null;

  if (typeof candidate !== 'string') {
    return null;
  }

  const normalized = candidate.trim();
  return normalized.length > 0 ? normalized : null;
};

const resolveLabel = (result, index, providedInputs) => {
  if (providedInputs[index]) {
    return providedInputs[index];
  }

  const fromResult = result.input || result.metadata?.input;
  if (fromResult && fromResult.trim()) {
    return fromResult.trim();
  }

  return `Input ${index + 1}`;
};

const SecurityPostureSummary = ({ inputs, inputResults, fallbackIndustry }) => {
  const preparedResults = useMemo(() => {
    const entries = [];

    inputResults.forEach((result, index) => {
      const scores = Array.isArray(result.assessment?.scores)
        ? result.assessment?.scores
        : [];

      if (scores.length === 0) {
        return;
      }

      entries.push({
        label: resolveLabel(result, index, inputs),
        scores,
        industry: resolveIndustry(result, fallbackIndustry),
        hasPostQuantumKeyExchange:
          result.assessment?.summary?.hasPostQuantumKeyExchange === true,
      });
    });

    return entries;
  }, [fallbackIndustry, inputResults, inputs]);

  const [selectedIndex, setSelectedIndex] = useState(0);

  const graphSize = useMemo(() => {
    if (typeof window === 'undefined') {
      return 280;
    }

    return Math.max(220, Math.min(340, window.innerWidth - 160));
  }, []);

  if (preparedResults.length === 0) {
    return null;
  }

  const boundedSelectedIndex = Math.min(selectedIndex, preparedResults.length - 1);
  const selected = preparedResults[boundedSelectedIndex];

  const PostQuantumBadge = () => (
    <span className="pq-badge pq-badge--dense">
      <svg
        width="14"
        height="14"
        viewBox="0 0 20 20"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M10 1.5l7 3v5c0 4.418-2.686 7.971-7 9-4.314-1.029-7-4.582-7-9v-5z"
          fill="currentColor"
        />
        <path
          d="M8.25 10.25l2 2 3.5-3.5"
          fill="none"
          stroke="#fff"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Post-Quantum Ready
    </span>
  );

  return (
    <div className="security-visualization" aria-label="Security posture overview">
      {preparedResults.length > 1 && (
        <label className="security-visualization__selector">
          <span>Select input</span>
          <select
            value={boundedSelectedIndex}
            onChange={(event) => setSelectedIndex(Number(event.target.value))}
          >
            {preparedResults.map((result, index) => (
              <option key={result.label} value={index}>
                {result.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {selected.hasPostQuantumKeyExchange && <PostQuantumBadge />}

      <HexagonGraph
        scores={selected.scores}
        size={graphSize}
        inputLabel={selected.label}
        industry={selected.industry}
      />

      <HeadlineAnalysis
        scores={selected.scores}
        inputLabel={selected.label}
        industry={selected.industry}
      />
    </div>
  );
};

export default SecurityPostureSummary;
