import React, { useMemo } from 'react';
import TrendIndicator from './TrendIndicator';
import { MEDIAN_INDUSTRY_SCORES, MEDIAN_SCORES, Score } from './medianScores';
import { getTrendComparison } from './scoreComparison';

interface HexagonGraphProps {
  scores: Score[];
  size?: number;
  inputLabel?: string;
  industry?: string | null;
}

interface HexagonPoint {
  x: number;
  y: number;
  value: number;
  category: string;
}

const CATEGORY_ORDER: string[] = [
  'tls',
  'web',
  'email',
  'reporting',
  'overall',
  'dns',
];

const clampSize = (size?: number): number => {
  if (!size || Number.isNaN(size)) {
    return 300;
  }
  return Math.min(Math.max(size, 200), 360);
};

const HexagonGraph: React.FC<HexagonGraphProps> = ({
  scores,
  size = 300,
  inputLabel = 'Input data',
  industry,
}) => {
  const normalizedSize = clampSize(size);
  const normalizedIndustry = industry?.toLowerCase();
  const baseline =
    normalizedIndustry && normalizedIndustry !== 'irrelevance'
      ? MEDIAN_INDUSTRY_SCORES[normalizedIndustry] || MEDIAN_SCORES
      : MEDIAN_SCORES;

  const graph = useMemo(() => {
    const svgSize = normalizedSize;
    const center = svgSize / 2;
    const maxRadius = svgSize * 0.35;
    const labelArrowOffset = svgSize * 0.06;
    const labelTextOffset = svgSize * 0.13;
    const CATEGORY_MARGIN_ADJUSTMENTS: Record<string, number> = {
      dns: svgSize * 0.03,
      reporting: svgSize * 0.03,
    };
    const gridLevels = [0.2, 0.4, 0.6, 0.8, 1];

    const getHexagonCorners = (radius: number) =>
      Array.from({ length: 6 }, (_, index) => {
        const angle = index * 60 - 60;
        const radians = (angle * Math.PI) / 180;
        return {
          x: center + radius * Math.cos(radians),
          y: center + radius * Math.sin(radians),
          angle,
        };
      });

    const outerCorners = getHexagonCorners(maxRadius);

    const toPoints = (dataset: Score[]): HexagonPoint[] => {
      return CATEGORY_ORDER.map((category, index) => {
        const rawScore = dataset.find((item) => item.category === category);
        const value = rawScore ? rawScore.median_score : 0;
        const radians = (outerCorners[index].angle * Math.PI) / 180;
        const mappedValue = (value + 1) / 2; // map -1..1 to 0..1
        const radius = maxRadius * mappedValue;

        return {
          x: center + radius * Math.cos(radians),
          y: center + radius * Math.sin(radians),
          value,
          category,
        };
      });
    };

    const dataPoints = toPoints(scores);
    const baselinePoints = toPoints(baseline);

    const pointsToPath = (points: HexagonPoint[]) =>
      points
        .map(
          (point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
        )
        .join(' ') + ' Z';

    const gridPaths = gridLevels.map((level) =>
      pointsToPath(
        getHexagonCorners(maxRadius * level).map((corner) => ({
          x: corner.x,
          y: corner.y,
          value: 0,
          category: '',
        }))
      )
    );

    const labelPositions = outerCorners.map((corner, index) => {
      const radians = (corner.angle * Math.PI) / 180;
      const category = CATEGORY_ORDER[index];
      const spacingAdjustment = CATEGORY_MARGIN_ADJUSTMENTS[category] || 0;
      const arrowX =
        center +
        (maxRadius + labelArrowOffset + spacingAdjustment) * Math.cos(radians);
      const arrowY =
        center +
        (maxRadius + labelArrowOffset + spacingAdjustment) * Math.sin(radians);
      const textX =
        center +
        (maxRadius + labelTextOffset + spacingAdjustment) * Math.cos(radians);
      const textY =
        center +
        (maxRadius + labelTextOffset + spacingAdjustment) * Math.sin(radians);

      const actualValue = dataPoints[index]?.value ?? 0;
      const baselineValue = baselinePoints[index]?.value ?? 0;

      return {
        arrowX,
        arrowY,
        textX,
        textY,
        category: category.toUpperCase(),
        trend: getTrendComparison(actualValue, baselineValue),
      };
    });

    return {
      svgSize,
      center,
      gridPaths,
      dataPath: pointsToPath(dataPoints),
      baselinePath: pointsToPath(baselinePoints),
      labelPositions,
    };
  }, [baseline, normalizedSize, scores]);

  const baselineLabel = 'Industry average';

  return (
    <div className="hexagon-graph" style={{ maxWidth: '100%' }}>
      <svg
        viewBox={`0 0 ${graph.svgSize} ${graph.svgSize}`}
        role="img"
        aria-label="Security radar graph"
      >
        <defs>
          <linearGradient id="radarGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.85} />
            <stop offset="50%" stopColor="#8b5cf6" stopOpacity={0.65} />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.6} />
          </linearGradient>
        </defs>

        {graph.gridPaths.map((path, index) => (
          <path
            key={`grid-${index}`}
            d={path}
            fill="none"
            stroke="#e0e7ff"
            strokeWidth={1}
          />
        ))}

        {[0, 1, 2, 3, 4, 5].map((index) => {
          const angle = (index * 60 - 60) * (Math.PI / 180);
          const x = graph.center + graph.svgSize * 0.35 * Math.cos(angle);
          const y = graph.center + graph.svgSize * 0.35 * Math.sin(angle);
          return (
            <line
              key={`axis-${index}`}
              x1={graph.center}
              y1={graph.center}
              x2={x}
              y2={y}
              stroke="#c7d2fe"
              strokeWidth={1}
              strokeOpacity={0.6}
            />
          );
        })}

        <path
          d={graph.baselinePath}
          fill="none"
          stroke="#94a3b8"
          strokeWidth={1}
          strokeDasharray="4 4"
        />
        <path
          d={graph.dataPath}
          fill="url(#radarGradient)"
          stroke="#7c3aed"
          strokeWidth={1.5}
        />

        {graph.labelPositions.map((label, index) => (
          <g key={`label-${index}`}>
            <text
              x={label.textX}
              y={label.textY}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{
                fontSize: normalizedSize <= 240 ? '10px' : '12px',
                fontWeight: 600,
                fill: '#334155',
              }}
            >
              {label.category}
            </text>
            <g
              transform={`translate(${label.arrowX - 12}, ${
                label.arrowY - 12
              })`}
            >
              <TrendIndicator comparison={label.trend} size={24} />
            </g>
          </g>
        ))}

        <circle cx={graph.center} cy={graph.center} r={2} fill="#475569" />
      </svg>

      <div className="hexagon-legend">
        <div className="hexagon-legend__item">
          <span className="hexagon-legend__indicator hexagon-legend__indicator--filled" />
          <span className="hexagon-legend__text">{inputLabel}</span>
        </div>
        <div className="hexagon-legend__item">
          <span className="hexagon-legend__indicator hexagon-legend__indicator--dotted" />
          <span className="hexagon-legend__text">{baselineLabel}</span>
        </div>
      </div>
    </div>
  );
};

export default HexagonGraph;
