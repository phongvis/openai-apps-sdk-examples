import React, { useMemo } from 'react';
import TrendIndicator from './TrendIndicator';
import { MEDIAN_INDUSTRY_SCORES, MEDIAN_SCORES } from './medianScores';

const CATEGORY_ORDER = ['tls', 'web', 'email', 'reporting', 'overall', 'dns'];

const clampSize = (size) => {
  if (!size || Number.isNaN(size)) {
    return 300;
  }
  return Math.min(Math.max(size, 200), 360);
};

const HexagonGraph = ({ scores, size = 300, inputLabel = 'Input data', industry }) => {
  const normalizedSize = clampSize(size);
  const normalizedIndustry = industry?.toLowerCase();
  const baseline =
    normalizedIndustry && normalizedIndustry !== 'irrelevance'
      ? MEDIAN_INDUSTRY_SCORES[normalizedIndustry] || MEDIAN_SCORES
      : MEDIAN_SCORES;

  const graph = useMemo(() => {
    const center = normalizedSize / 2;
    const maxRadius = normalizedSize * 0.35;
    
    // Offsets for labels outside the hexagon
    const arrowOffset = 15;
    const categoryOffset = 50;
    
    const gridLevels = [0.2, 0.4, 0.6, 0.8, 1];

    const getHexagonCorners = (radius) =>
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

    const toPoints = (dataset) => {
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

    const pointsToPath = (points) =>
      points
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
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
      
      const arrowX = center + (maxRadius + arrowOffset) * Math.cos(radians);
      const arrowY = center + (maxRadius + arrowOffset) * Math.sin(radians);
      const categoryX = center + (maxRadius + categoryOffset) * Math.cos(radians);
      const categoryY = center + (maxRadius + categoryOffset) * Math.sin(radians);

      const actualValue = dataPoints[index]?.value ?? 0;
      const baselineValue = baselinePoints[index]?.value ?? 0;
      const isAboveMedian = actualValue > baselineValue;

      return {
        arrowX,
        arrowY,
        categoryX,
        categoryY,
        category: category.toUpperCase(),
        isAboveMedian,
      };
    });

    return {
      size: normalizedSize,
      center,
      maxRadius,
      outerCorners,
      gridPaths,
      dataPath: pointsToPath(dataPoints),
      baselinePath: pointsToPath(baselinePoints),
      labelPositions,
    };
  }, [baseline, normalizedSize, scores]);

  const baselineLabel = 'Industry average';

  return (
    <div className="hexagon-graph">
      <div
        className="hexagon-graph__container"
        style={{
          width: graph.size,
          height: graph.size,
          position: 'relative',
          margin: '20px auto',
        }}
      >
        <svg
          viewBox={`0 0 ${graph.size} ${graph.size}`}
          style={{ width: '100%', height: '100%', overflow: 'visible' }}
          role="img"
          aria-label="Security radar graph"
        >
          <defs>
            <linearGradient id="radarGradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.8} />
              <stop offset="50%" stopColor="#8b5cf6" stopOpacity={0.7} />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.6} />
            </linearGradient>
          </defs>

          {/* Grid lines (concentric hexagons) */}
          {graph.gridPaths.map((path, index) => (
            <path
              key={`grid-${index}`}
              d={path}
              fill="none"
              stroke="#e9ecef"
              strokeWidth={1}
            />
          ))}

          {/* Axis lines from center to corners */}
          {graph.outerCorners.map((corner, index) => (
            <line
              key={`axis-${index}`}
              x1={graph.center}
              y1={graph.center}
              x2={corner.x}
              y2={corner.y}
              stroke="#e9ecef"
              strokeWidth={1}
              opacity={0.5}
            />
          ))}

          {/* Median scores polygon (dotted line) */}
          <path
            d={graph.baselinePath}
            fill="none"
            stroke="#6b7280"
            strokeWidth={1}
            strokeDasharray="4 4"
          />

          {/* Data polygon */}
          <path
            d={graph.dataPath}
            fill="url(#radarGradient)"
            stroke="#3b82f6"
            strokeWidth={1}
          />

          {/* Category labels */}
          {graph.labelPositions.map((label, index) => (
            <g key={`label-${index}`}>
              <text
                x={label.categoryX}
                y={label.categoryY}
                textAnchor="middle"
                dominantBaseline="central"
                style={{
                  fontFamily: "'Open Sans', sans-serif",
                  fontSize: '12px',
                  fontWeight: 500,
                  fill: '#495057',
                }}
              >
                {label.category}
              </text>
              {/* Trend indicator */}
              <g transform={`translate(${label.arrowX - 10}, ${label.arrowY - 10})`}>
                <TrendIndicator
                  comparison={label.isAboveMedian ? 'above' : 'below'}
                  size={20}
                />
              </g>
            </g>
          ))}

          {/* Center point */}
          <circle cx={graph.center} cy={graph.center} r={2} fill="#6c757d" />
        </svg>
      </div>

      {/* Legend */}
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
