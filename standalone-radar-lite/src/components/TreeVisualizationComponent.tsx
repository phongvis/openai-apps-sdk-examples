// @ts-nocheck
import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

// TreeVisualization class converted to work with React
class TreeVisualization {
  constructor(container, options = {}) {
    this.container = d3.select(container);
    this.options = {
      horizontalSpacing: 120,
      nodeRadius: 16,
      verticalGap: 5,
      textMargin: 5,
      margins: { top: 30, right: 60, bottom: 30, left: 60 },
      ...options,
    };
    this.svg = null;
    this.data = null;
  }

  init() {
    this.svg = this.container.append('svg');
    return this;
  }

  render(graph) {
    if (!this.svg) {
      throw new Error('Visualization not initialized. Call init() first.');
    }

    this.data = graph;

    this.svg.selectAll('*').remove();

    const dimensions = this._calculateDimensions(graph);
    this.svg.attr('width', dimensions.width).attr('height', dimensions.height);

    const root = this._createHierarchy(graph);
    const treeData = this._layoutNodes(root, dimensions);

    this._drawLinks(treeData);
    this._drawNodes(treeData);

    return this;
  }

  update(graph) {
    return this.render(graph);
  }

  _getVerticalSpacing() {
    const hexHeight = this.options.nodeRadius * 1.2;
    return hexHeight + this.options.verticalGap;
  }

  _calculateDimensions(graph) {
    const nodeCount = graph.nodes.length;
    const root = this._createHierarchy(graph);
    const maxDepth = root.height;
    const verticalSpacing = this._getVerticalSpacing();

    // Get the actual container width instead of window width
    const containerElement = this.container.node();
    const containerWidth = containerElement
      ? containerElement.getBoundingClientRect().width
      : 800;

    // Check screen size categories
    const isMobile = window.innerWidth < 768;
    const isTablet = window.innerWidth >= 768 && window.innerWidth <= 1024;

    // More conservative spacing approach
    let horizontalSpacing, margins;

    if (isMobile) {
      horizontalSpacing = 80;
      margins = { top: 20, right: 60, bottom: 20, left: 30 }; // Increased right margin from 30 to 60
    } else if (isTablet) {
      // For tablet, use dynamic spacing but with better constraints
      const availableSpace = containerWidth - 80; // Leave padding
      const minSpacing = 90;
      const maxSpacing = 120;
      horizontalSpacing = Math.min(
        maxSpacing,
        Math.max(minSpacing, availableSpace / (maxDepth + 1))
      );
      margins = { top: 25, right: 50, bottom: 25, left: 40 }; // Increased right margin from 40 to 50
    } else {
      // Desktop: use container-based spacing but more conservatively
      const availableSpace = containerWidth - 120; // Leave more padding for desktop
      const minSpacing = 100;
      const maxSpacing = 120;
      horizontalSpacing = Math.min(
        maxSpacing,
        Math.max(minSpacing, availableSpace / (maxDepth + 1))
      );
      margins = { top: 30, right: 60, bottom: 30, left: 60 };
    }

    // Calculate width to fit within container, not exceed it
    const calculatedWidth =
      (maxDepth + 1) * horizontalSpacing + margins.left + margins.right;
    const width = Math.min(calculatedWidth, containerWidth);

    // Calculate height with reasonable limits
    const maxHeight = isMobile ? 300 : isTablet ? 450 : 600;
    const height = Math.min(
      nodeCount * verticalSpacing + margins.top + margins.bottom,
      maxHeight
    );

    return { width, height, margins, horizontalSpacing };
  }

  _createHierarchy(graph) {
    return d3
      .stratify()
      .id((d) => d.name)
      .parentId((d) => {
        const parentLink = graph.links.find((link) => link.target === d.name);
        return parentLink ? parentLink.source : null;
      })(graph.nodes);
  }

  _layoutNodes(root, dimensions) {
    const { margins } = dimensions;
    const treeLayout = d3
      .tree()
      .size([
        dimensions.height - margins.top - margins.bottom,
        dimensions.width - margins.left - margins.right,
      ])
      .separation(() => 1.5);

    const treeData = treeLayout(root);

    treeData.descendants().forEach((d) => {
      const temp = d.x;
      d.x = d.y + margins.left;
      d.y = temp + margins.top;
    });

    return treeData;
  }

  _createHexPath(radius) {
    const roundRadius = 2;
    const adjustedRadius = radius + roundRadius;
    const a = Math.PI / 3;

    const vertices = d3.range(6).map((i) => {
      const x = adjustedRadius * Math.cos(a * i);
      const y = adjustedRadius * Math.sin(a * i);
      return [x, y];
    });

    const startPoint = vertices[0];
    const firstEdgeDir = [
      vertices[1][0] - vertices[0][0],
      vertices[1][1] - vertices[0][1],
    ];
    const firstEdgeLength = Math.sqrt(
      firstEdgeDir[0] * firstEdgeDir[0] + firstEdgeDir[1] * firstEdgeDir[1]
    );
    const firstUnitX = firstEdgeDir[0] / firstEdgeLength;
    const firstUnitY = firstEdgeDir[1] / firstEdgeLength;

    const startX = startPoint[0] + firstUnitX * roundRadius;
    const startY = startPoint[1] + firstUnitY * roundRadius;

    let path = `M${startX},${startY}`;

    for (let i = 0; i < 6; i++) {
      const current = vertices[i];
      const next = vertices[(i + 1) % 6];
      const nextNext = vertices[(i + 2) % 6];

      const edgeDir = [next[0] - current[0], next[1] - current[1]];
      const edgeLength = Math.sqrt(
        edgeDir[0] * edgeDir[0] + edgeDir[1] * edgeDir[1]
      );
      const edgeUnitX = edgeDir[0] / edgeLength;
      const edgeUnitY = edgeDir[1] / edgeLength;

      const nextEdgeDir = [nextNext[0] - next[0], nextNext[1] - next[1]];
      const nextEdgeLength = Math.sqrt(
        nextEdgeDir[0] * nextEdgeDir[0] + nextEdgeDir[1] * nextEdgeDir[1]
      );
      const nextEdgeUnitX = nextEdgeDir[0] / nextEdgeLength;
      const nextEdgeUnitY = nextEdgeDir[1] / nextEdgeLength;

      const beforeVertexX = next[0] - edgeUnitX * roundRadius;
      const beforeVertexY = next[1] - edgeUnitY * roundRadius;
      const afterVertexX = next[0] + nextEdgeUnitX * roundRadius;
      const afterVertexY = next[1] + nextEdgeUnitY * roundRadius;

      path += `L${beforeVertexX},${beforeVertexY}`;
      path += `Q${next[0]},${next[1]} ${afterVertexX},${afterVertexY}`;
    }

    return path + 'Z';
  }

  _getHexVertex(node, isSource, radius = null) {
    radius = radius || this.options.nodeRadius;
    const angle = isSource ? 0 : Math.PI;

    return {
      x: node.x + radius * Math.cos(angle),
      y: node.y + radius * Math.sin(angle),
    };
  }

  _drawLinks(treeData) {
    this.svg
      .append('g')
      .selectAll('path')
      .data(treeData.links())
      .join('path')
      .attr('class', 'tree-link')
      .attr('d', (d) => {
        const sourceVertex = this._getHexVertex(d.source, true);
        const targetVertex = this._getHexVertex(d.target, false);

        const dx = targetVertex.x - sourceVertex.x;
        const dy = targetVertex.y - sourceVertex.y;
        const dr = Math.sqrt(dx * dx + dy * dy) * 0.3;

        return `M${sourceVertex.x},${sourceVertex.y}C${sourceVertex.x + dr},${
          sourceVertex.y
        } ${targetVertex.x - dr},${targetVertex.y} ${targetVertex.x},${
          targetVertex.y
        }`;
      });
  }

  _drawNodes(treeData) {
    const node = this.svg
      .append('g')
      .selectAll('g')
      .data(treeData.descendants())
      .join('g')
      .attr(
        'class',
        (d) =>
          'node state-' +
          (d.data.state || 'irrelevant') +
          (d.children ? '' : ' leaf')
      )
      .attr('transform', (d) => `translate(${d.x},${d.y})`);

    node.append('path').attr('d', this._createHexPath(this.options.nodeRadius));

    const textDistance = this.options.nodeRadius + this.options.textMargin;

    node
      .append('text')
      .attr('class', 'text-bg')
      .attr('dx', (d) => (d.children ? -textDistance : textDistance))
      .attr('dy', 0)
      .text((d) => d.data.displayName || d.data.name);

    node
      .append('text')
      .attr('dx', (d) => (d.children ? -textDistance : textDistance))
      .attr('dy', 0)
      .text((d) => d.data.displayName || d.data.name);
  }
}

// SimulationController class converted to work with React
class SimulationController {
  constructor(visualization, options = {}) {
    this.visualization = visualization;
    this.options = {
      stepDelay: 7000,
      initialDelay: 1000,
      nodeCount: 10,
      ...options,
    };
    this.originalData = null;
    this.currentTimeout = null;
    this.isRunning = false;
  }

  setOriginalData(data) {
    this.originalData = JSON.parse(JSON.stringify(data));
    return this;
  }

  start(statusCallback = () => {}) {
    if (this.isRunning || !this.originalData) return;

    this.isRunning = true;
    this._clearTimeouts();

    const resetData = this._cloneData(this.originalData);
    resetData.nodes.forEach((node) => (node.state = 'irrelevant'));
    this.visualization.update(resetData);
    statusCallback('All nodes reset to irrelevant state');

    const selectedNodes = this.getRandomLeafNodes(this.options.nodeCount);

    this.currentTimeout = setTimeout(() => {
      const checkingData = this._cloneData(resetData);
      this._updateNodeStates(checkingData, selectedNodes, 'checking');
      this.visualization.update(checkingData);
      statusCallback(
        `${selectedNodes.length} nodes started checking (pulsing animation)`
      );

      this.currentTimeout = setTimeout(() => {
        const firstBatchData = this._cloneData(checkingData);
        const firstBatch = selectedNodes.slice(
          0,
          Math.ceil(selectedNodes.length / 2)
        );
        this._updateNodeStates(firstBatchData, firstBatch, 'checked');
        this.visualization.update(firstBatchData);
        statusCallback(
          `${firstBatch.length} nodes completed, ${
            selectedNodes.length - firstBatch.length
          } still checking`
        );

        this.currentTimeout = setTimeout(() => {
          const finalData = this._cloneData(firstBatchData);
          const secondBatch = selectedNodes.slice(
            Math.ceil(selectedNodes.length / 2)
          );
          this._updateNodeStates(finalData, secondBatch, 'checked');
          this.visualization.update(finalData);
          statusCallback(
            `All ${selectedNodes.length} nodes completed! Simulation finished.`
          );

          this.isRunning = false;
        }, this.options.stepDelay);
      }, this.options.stepDelay);
    }, this.options.initialDelay);
  }

  stop() {
    this._clearTimeouts();
    this.isRunning = false;
  }

  getRandomLeafNodes(count) {
    if (!this.originalData) return [];

    const leafNodes = this.originalData.nodes.filter((node) => {
      return !this.originalData.links.some((link) => link.source === node.name);
    });

    const shuffled = leafNodes.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(count, shuffled.length));
  }

  getIsRunning() {
    return this.isRunning;
  }

  _cloneData(data) {
    return JSON.parse(JSON.stringify(data));
  }

  _updateNodeStates(data, selectedNodes, state) {
    selectedNodes.forEach((selectedNode) => {
      const nodeName = selectedNode.name || selectedNode;
      const node = data.nodes.find((n) => n.name === nodeName);
      if (node) node.state = state;
    });
  }

  _clearTimeouts() {
    if (this.currentTimeout) {
      clearTimeout(this.currentTimeout);
      this.currentTimeout = null;
    }
  }
}

const sampleData = {
  nodes: [
    { name: 'ANY', state: 'irrelevant', displayName: 'ALL' },
    { name: 'DNS', state: 'irrelevant' },
    { name: 'DNS Zone Checks', state: 'irrelevant' },
    { name: 'DNSSEC', state: 'irrelevant' },
    { name: 'DANE', state: 'irrelevant' },
    {
      name: 'Certification Authority Authorization (CAA)',
      state: 'irrelevant',
    },
    { name: 'WEB', state: 'irrelevant' },
    { name: 'TLS(HTTPS)', state: 'irrelevant' },
    { name: 'Certificates', state: 'irrelevant' },
    { name: 'Cookies', state: 'irrelevant' },
    { name: 'Headers', state: 'irrelevant' },
    { name: 'Subresource Integrity (SRI)', state: 'irrelevant' },
    { name: 'Content Security Policy (CSP)', state: 'irrelevant' },
    { name: 'Mixed Content Protection', state: 'irrelevant' },
    { name: 'XSS Protection', state: 'irrelevant' },
    { name: 'EMAIL', state: 'irrelevant' },
    { name: 'BIMI', state: 'irrelevant' },
    { name: 'DMARC', state: 'irrelevant' },
    { name: 'SPF', state: 'irrelevant' },
    { name: 'DKIM', state: 'irrelevant' },
    { name: 'VMC', state: 'irrelevant' },
    { name: 'MTA-STS', state: 'irrelevant' },
    { name: 'TLS-RPT', state: 'irrelevant' },
    { name: 'TLS(SMTP)', state: 'irrelevant' },
  ],
  links: [
    { source: 'ANY', target: 'DNS' },
    { source: 'DNS', target: 'DNS Zone Checks' },
    { source: 'DNS', target: 'DNSSEC' },
    { source: 'DNSSEC', target: 'DANE' },
    { source: 'DNS', target: 'Certification Authority Authorization (CAA)' },
    { source: 'ANY', target: 'WEB' },
    { source: 'WEB', target: 'TLS(HTTPS)' },
    { source: 'WEB', target: 'Certificates' },
    { source: 'WEB', target: 'Cookies' },
    { source: 'WEB', target: 'Headers' },
    { source: 'WEB', target: 'Subresource Integrity (SRI)' },
    { source: 'WEB', target: 'Content Security Policy (CSP)' },
    { source: 'WEB', target: 'Mixed Content Protection' },
    { source: 'WEB', target: 'XSS Protection' },
    { source: 'ANY', target: 'EMAIL' },
    { source: 'EMAIL', target: 'BIMI' },
    { source: 'BIMI', target: 'DMARC' },
    { source: 'DMARC', target: 'SPF' },
    { source: 'DMARC', target: 'DKIM' },
    { source: 'BIMI', target: 'VMC' },
    { source: 'EMAIL', target: 'MTA-STS' },
    { source: 'MTA-STS', target: 'TLS-RPT' },
    { source: 'EMAIL', target: 'TLS(SMTP)' },
  ],
};

// React Component
const TreeVisualizationComponent = (props) => {
  const {
    intent = null,
    data = sampleData,
    headerMessage = null,
    textContent = null,
    analysisPhase = 'idle',
  } = props;
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [hexSize, setHexSize] = useState(10);
  const [simulationController, setSimulationController] = useState(null);
  const [isMobile, setIsMobile] = useState(false);

  // Check if mobile and add resize listener
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      const newHexSize = mobile ? 8 : 10;
      setHexSize(newHexSize);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Function to find nodes that match the intent
  const findMatchingNodes = (intent, data) => {
    if (!intent) return [];

    const intentLower = intent.toLowerCase();

    // First, find direct matches
    const directMatches = data.nodes.filter((node) => {
      const nodeName = node.name.toLowerCase();
      // Direct name match
      if (nodeName === intentLower) {
        return true;
      }
      return false;
    });

    // Now find all downstream nodes from the direct matches
    const allMatchingNodes = new Set(directMatches);
    // Function to recursively find all downstream nodes
    const findDownstreamNodes = (nodeName) => {
      const downstreamLinks = data.links.filter(
        (link) => link.source === nodeName
      );
      downstreamLinks.forEach((link) => {
        const targetNode = data.nodes.find((n) => n.name === link.target);
        if (targetNode && !allMatchingNodes.has(targetNode)) {
          allMatchingNodes.add(targetNode);
          // Recursively find downstream nodes of this target
          findDownstreamNodes(targetNode.name);
        }
      });
    };

    // For each direct match, find all its downstream nodes
    directMatches.forEach((matchedNode) => {
      findDownstreamNodes(matchedNode.name);
    });

    return Array.from(allMatchingNodes);
  };

  useEffect(() => {
    if (svgRef.current && !isMobile) {
      // Clear any existing content
      d3.select(svgRef.current).selectAll('*').remove();

      // Create new visualization
      const viz = new TreeVisualization(svgRef.current, {
        nodeRadius: hexSize,
      });

      // Prepare data with intent-based highlighting
      const processedData = { ...data };

      if (intent) {
        const matchingNodes = findMatchingNodes(intent, data);
        const downstreamState = () => {
          if (analysisPhase === 'complete') return 'checked';
          if (analysisPhase === 'error') return 'irrelevant';
          return 'checking';
        };

        // Reset all nodes to irrelevant first
        processedData.nodes = data.nodes.map((node) => ({
          ...node,
          state: 'irrelevant',
        }));

        // Find direct matches first
        const intentLower = intent.toLowerCase();
        const directMatches = data.nodes.filter((node) => {
          const nodeName = node.name.toLowerCase();

          // Direct name match
          if (nodeName === intentLower) {
            return true;
          }
          return false;
        });

        // Highlight direct matches
        directMatches.forEach((matchingNode) => {
          const nodeIndex = processedData.nodes.findIndex(
            (n) => n.name === matchingNode.name
          );
          if (nodeIndex !== -1) {
            processedData.nodes[nodeIndex].state = 'intent-match';
          }
        });

        // Highlight downstream nodes (those that are not direct matches)
        matchingNodes.forEach((matchingNode) => {
          const nodeIndex = processedData.nodes.findIndex(
            (n) => n.name === matchingNode.name
          );
          if (
            nodeIndex !== -1 &&
            processedData.nodes[nodeIndex].state !== 'intent-match'
          ) {
            processedData.nodes[nodeIndex].state = downstreamState();
          }
        });

        if (analysisPhase === 'complete') {
          processedData.nodes = processedData.nodes.map((node) => {
            if (node.state === 'checking') {
              return {
                ...node,
                state: 'checked',
              };
            }
            return node;
          });
        }

        // No status message for intent-based highlighting
        // no-op: status messaging removed for simplified UI
      } else {
        // If no intent, reset all nodes to irrelevant
        processedData.nodes = data.nodes.map((node) => ({
          ...node,
          state: 'irrelevant',
        }));
        // no-op: status messaging removed for simplified UI
      }

      try {
        viz.init().render(processedData);

        // Create simulation controller with processed data
        const controller = new SimulationController(viz);
        controller.setOriginalData(processedData);
        setSimulationController(controller);
      } catch (error) {
        console.error('Error creating visualization:', error);
      }
    } else if (isMobile) {
      // On mobile, we skip rendering the tree to save performance
    }
  }, [hexSize, intent, data, isMobile, analysisPhase]);

  // Auto-start simulation when component mounts or visualization changes (only if no intent)
  useEffect(() => {
    if (
      simulationController &&
      !intent &&
      !simulationController.getIsRunning()
    ) {
      simulationController.start(() => {
        // no-op callback; animation runs autonomously in standalone demo
      });
    }
  }, [simulationController, intent]);

  // Simple mobile loading component
  const MobileLoadingAnimation = () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px 20px', // Reduced from 40px
        minHeight: '120px', // Reduced from 200px
        // Improve iPhone rendering
        WebkitBackfaceVisibility: 'hidden',
        backfaceVisibility: 'hidden',
        transform: 'translateZ(0)', // Force hardware acceleration
        willChange: 'transform',
      }}
    >
      {/* Double hexagon animation - reduced size with improved quality */}
      <div
        style={{
          marginBottom: '16px', // Reduced from 24px
          position: 'relative',
          width: '24px', // Reduced from 48px
          height: '24px', // Reduced from 48px
          // Improve animation smoothness on iPhone
          WebkitBackfaceVisibility: 'hidden',
          backfaceVisibility: 'hidden',
          transform: 'translateZ(0)',
          willChange: 'transform',
        }}
      >
        {/* Outer hexagon */}
        <svg
          width="24" // Reduced from 48
          height="24" // Reduced from 48
          viewBox="0 0 48 48" // Keep viewBox same for proportions
          style={{
            position: 'absolute',
            animation: `mobileHexSpin 3s linear infinite`,
            // Improve SVG rendering on iPhone
            shapeRendering: 'geometricPrecision',
            WebkitBackfaceVisibility: 'hidden',
            backfaceVisibility: 'hidden',
            transform: 'translateZ(0)',
          }}
        >
          <polygon
            points="24,2 38,11 38,29 24,38 10,29 10,11"
            fill="none"
            stroke="#8B65FF"
            strokeWidth="2"
            opacity="0.8"
            style={{
              // Vector sharpness for high-DPI displays
              vectorEffect: 'non-scaling-stroke',
            }}
          />
        </svg>

        {/* Inner hexagon - counter-rotating */}
        <svg
          width="24" // Reduced from 48
          height="24" // Reduced from 48
          viewBox="0 0 48 48" // Keep viewBox same for proportions
          style={{
            position: 'absolute',
            animation: `mobileHexSpinReverse 2s linear infinite`,
            // Improve SVG rendering on iPhone
            shapeRendering: 'geometricPrecision',
            WebkitBackfaceVisibility: 'hidden',
            backfaceVisibility: 'hidden',
            transform: 'translateZ(0)',
          }}
        >
          <polygon
            points="24,8 32,13 32,23 24,28 16,23 16,13"
            fill="#ED1651"
            stroke="#8B65FF"
            strokeWidth="1"
            opacity="0.6"
            style={{
              vectorEffect: 'non-scaling-stroke',
            }}
          />
          <polygon
            points="24,12 28,15 28,21 24,24 20,21 20,15"
            fill="#6AB7FF"
            opacity="0.3"
          />
        </svg>
      </div>

      {/* Status text with improved iPhone rendering */}
      <div
        style={{
          textAlign: 'center',
          color: '#6b7280',
          fontSize: '14px', // Reduced from 16px
          fontFamily: "'Space Grotesk', sans-serif",
          fontWeight: '500',
          marginBottom: '6px', // Reduced from 8px
          // Improve text rendering on iPhone
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
          textRendering: 'optimizeLegibility',
        }}
      >
        {textContent?.tree_analyzing_security_text || 'Analyzing Security'}
      </div>

      {/* Subtext with improved iPhone rendering */}
      <div
        style={{
          textAlign: 'center',
          color: '#9ca3af',
          fontSize: '12px', // Reduced from 14px
          fontFamily: "'Space Grotesk', sans-serif",
          fontWeight: '400',
          // Improve text rendering on iPhone
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
          textRendering: 'optimizeLegibility',
        }}
      >
        {textContent?.tree_please_wait_text || 'Please wait...'}
      </div>
    </div>
  );

  return (
    <div ref={containerRef} className="w-full max-w-full overflow-auto">
      <style>{`        
        @keyframes mobileHexSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        @keyframes mobileHexSpinReverse {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(-360deg); }
        }
        
        @keyframes mobileDotPulse {
          0%, 100% { 
            transform: scale(1);
            opacity: 0.4;
          }
          50% { 
            transform: scale(1.5);
            opacity: 1;
          }
        }
        
        .tree-visualization {
          font-family: 'Space Grotesk', system-ui, sans-serif;
          width: 100%;
          overflow-x: auto;
          overflow-y: hidden;
        }
        
        .tree-visualization svg {
          max-width: 100%;
          height: auto;
        }
        
        .tree-visualization .node path {
          stroke: none;
        }
        
        .tree-visualization .node.state-irrelevant path {
          fill: #ccc;
        }
        
        .tree-visualization .node.state-checking path {
          fill: #ccc;
          stroke: #6AB7FF;
          stroke-width: 4px;
          animation: pulse 1.4s ease-in-out infinite;
        }
        
        .tree-visualization .node.state-checked path {
          fill: #6AB7FF;
        }
        
        .tree-visualization .node.state-intent-match path {
          fill: #10b981;
          stroke: #059669;
          stroke-width: 2px;
        }
        
        .tree-visualization .node text {
          fill: #1f2937;
          font-size: 12px;
          font-weight: 500;
          font-family: 'Space Grotesk', system-ui, sans-serif;
          pointer-events: none;
          dominant-baseline: central;
        }
        
        .tree-visualization .node.leaf text {
          text-anchor: start;
        }
        
        .tree-visualization .node:not(.leaf) text {
          text-anchor: end;
        }
        
        .tree-visualization .node .text-bg {
          fill: #fafafa;
          stroke: #fafafa;
          stroke-width: 3;
          opacity: 0.9;
        }
        
        @keyframes pulse {
          0% { stroke-opacity: 1; }
          50% { stroke-opacity: 0.2; }
          100% { stroke-opacity: 1; }
        }
        
        .tree-visualization .tree-link {
          stroke: #6b7280;
          stroke-width: 1.2px;
          fill: none;
        }
      `}</style>

      {headerMessage && (
        <div className="bg-white border-b border-gray-200 p-4 text-center">
          <h3 className="text-lg font-semibold text-gray-800 font-['Space_Grotesk']">
            {headerMessage}
          </h3>
        </div>
      )}

      {/* Simplified render logic - just show what we need */}
      {isMobile ? (
        <MobileLoadingAnimation />
      ) : (
        <div className="tree-visualization">
          <div ref={svgRef}></div>
        </div>
      )}
    </div>
  );
};

export default TreeVisualizationComponent;
