import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

// Lightweight D3-driven tree renderer reused from the standalone demo.
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
    this.svg = this.container.append("svg");
    return this;
  }

  render(graph) {
    if (!this.svg) {
      throw new Error("Visualization not initialized. Call init() first.");
    }

    this.data = graph;

    this.svg.selectAll("*").remove();

    const dimensions = this._calculateDimensions(graph);
    this.svg.attr("width", dimensions.width).attr("height", dimensions.height);

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

    const containerElement = this.container.node();
    const containerWidth = containerElement
      ? containerElement.getBoundingClientRect().width
      : 800;

    const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1024;
    const isMobile = viewportWidth < 768;
    const isTablet = viewportWidth >= 768 && viewportWidth <= 1024;

    let horizontalSpacing;
    let margins;

    if (isMobile) {
      horizontalSpacing = 80;
      margins = { top: 20, right: 60, bottom: 20, left: 30 };
    } else if (isTablet) {
      const availableSpace = containerWidth - 80;
      const minSpacing = 90;
      const maxSpacing = 120;
      horizontalSpacing = Math.min(
        maxSpacing,
        Math.max(minSpacing, availableSpace / (maxDepth + 1))
      );
      margins = { top: 25, right: 50, bottom: 25, left: 40 };
    } else {
      const availableSpace = containerWidth - 120;
      const minSpacing = 100;
      const maxSpacing = 120;
      horizontalSpacing = Math.min(
        maxSpacing,
        Math.max(minSpacing, availableSpace / (maxDepth + 1))
      );
      margins = { top: 30, right: 60, bottom: 30, left: 60 };
    }

    const calculatedWidth =
      (maxDepth + 1) * horizontalSpacing + margins.left + margins.right;
    const width = Math.min(calculatedWidth, containerWidth);

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

    return path + "Z";
  }

  _getHexVertex(node, isSource, radius = null) {
    const chosenRadius = radius || this.options.nodeRadius;
    const angle = isSource ? 0 : Math.PI;

    return {
      x: node.x + chosenRadius * Math.cos(angle),
      y: node.y + chosenRadius * Math.sin(angle),
    };
  }

  _drawLinks(treeData) {
    this.svg
      .append("g")
      .selectAll("path")
      .data(treeData.links())
      .join("path")
      .attr("class", "tree-link")
      .attr("d", (d) => {
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
      .append("g")
      .selectAll("g")
      .data(treeData.descendants())
      .join("g")
      .attr(
        "class",
        (d) =>
          "node state-" +
          (d.data.state || "irrelevant") +
          (d.children ? "" : " leaf")
      )
      .attr("transform", (d) => `translate(${d.x},${d.y})`);

    node.append("path").attr("d", this._createHexPath(this.options.nodeRadius));

    const textDistance = this.options.nodeRadius + this.options.textMargin;

    node
      .append("text")
      .attr("class", "text-bg")
      .attr("dx", (d) => (d.children ? -textDistance : textDistance))
      .attr("dy", 0)
      .text((d) => d.data.displayName || d.data.name);

    node
      .append("text")
      .attr("dx", (d) => (d.children ? -textDistance : textDistance))
      .attr("dy", 0)
      .text((d) => d.data.displayName || d.data.name);
  }
}

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
    resetData.nodes.forEach((node) => (node.state = "irrelevant"));
    this.visualization.update(resetData);
    statusCallback("All nodes reset to irrelevant state");

    const selectedNodes = this.getRandomLeafNodes(this.options.nodeCount);

    this.currentTimeout = setTimeout(() => {
      const checkingData = this._cloneData(resetData);
      this._updateNodeStates(checkingData, selectedNodes, "checking");
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
        this._updateNodeStates(firstBatchData, firstBatch, "checked");
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
          this._updateNodeStates(finalData, secondBatch, "checked");
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
    { name: "ANY", state: "irrelevant", displayName: "ALL" },
    { name: "DNS", state: "irrelevant" },
    { name: "DNS Zone Checks", state: "irrelevant" },
    { name: "DNSSEC", state: "irrelevant" },
    { name: "DANE", state: "irrelevant" },
    {
      name: "Certification Authority Authorization (CAA)",
      state: "irrelevant",
    },
    { name: "WEB", state: "irrelevant" },
    { name: "TLS(HTTPS)", state: "irrelevant" },
    { name: "Certificates", state: "irrelevant" },
    { name: "Cookies", state: "irrelevant" },
    { name: "Headers", state: "irrelevant" },
    { name: "Subresource Integrity (SRI)", state: "irrelevant" },
    { name: "Content Security Policy (CSP)", state: "irrelevant" },
    { name: "Mixed Content Protection", state: "irrelevant" },
    { name: "XSS Protection", state: "irrelevant" },
    { name: "EMAIL", state: "irrelevant" },
    { name: "BIMI", state: "irrelevant" },
    { name: "DMARC", state: "irrelevant" },
    { name: "SPF", state: "irrelevant" },
    { name: "DKIM", state: "irrelevant" },
    { name: "VMC", state: "irrelevant" },
    { name: "MTA-STS", state: "irrelevant" },
    { name: "TLS-RPT", state: "irrelevant" },
    { name: "TLS(SMTP)", state: "irrelevant" },
  ],
  links: [
    { source: "ANY", target: "DNS" },
    { source: "DNS", target: "DNS Zone Checks" },
    { source: "DNS", target: "DNSSEC" },
    { source: "DNSSEC", target: "DANE" },
    { source: "DNS", target: "Certification Authority Authorization (CAA)" },
    { source: "ANY", target: "WEB" },
    { source: "WEB", target: "TLS(HTTPS)" },
    { source: "WEB", target: "Certificates" },
    { source: "WEB", target: "Cookies" },
    { source: "WEB", target: "Headers" },
    { source: "WEB", target: "Subresource Integrity (SRI)" },
    { source: "WEB", target: "Content Security Policy (CSP)" },
    { source: "WEB", target: "Mixed Content Protection" },
    { source: "WEB", target: "XSS Protection" },
    { source: "ANY", target: "EMAIL" },
    { source: "EMAIL", target: "BIMI" },
    { source: "BIMI", target: "DMARC" },
    { source: "DMARC", target: "SPF" },
    { source: "DMARC", target: "DKIM" },
    { source: "BIMI", target: "VMC" },
    { source: "EMAIL", target: "MTA-STS" },
    { source: "MTA-STS", target: "TLS-RPT" },
    { source: "EMAIL", target: "TLS(SMTP)" },
  ],
};

const TreeVisualizationComponent = ({
  intent = null,
  data = sampleData,
  headerMessage = null,
  textContent = null,
  analysisPhase = "idle",
}) => {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [hexSize, setHexSize] = useState(10);
  const [simulationController, setSimulationController] = useState(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      setHexSize(mobile ? 8 : 10);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const findMatchingNodes = (currentIntent, currentData) => {
    if (!currentIntent) return [];

    const intentLower = currentIntent.toLowerCase();

    const directMatches = currentData.nodes.filter((node) => {
      const nodeName = node.name.toLowerCase();
      return nodeName === intentLower;
    });

    const allMatchingNodes = new Set(directMatches);

    const findDownstreamNodes = (nodeName) => {
      const downstreamLinks = currentData.links.filter(
        (link) => link.source === nodeName
      );
      downstreamLinks.forEach((link) => {
        const targetNode = currentData.nodes.find((n) => n.name === link.target);
        if (targetNode && !allMatchingNodes.has(targetNode)) {
          allMatchingNodes.add(targetNode);
          findDownstreamNodes(targetNode.name);
        }
      });
    };

    directMatches.forEach((matchedNode) => {
      findDownstreamNodes(matchedNode.name);
    });

    return Array.from(allMatchingNodes);
  };

  useEffect(() => {
    if (!svgRef.current || isMobile) {
      return;
    }

    const viz = new TreeVisualization(svgRef.current, {
      nodeRadius: hexSize,
    });

    const processedData = { ...data };

    if (intent) {
      const matchingNodes = findMatchingNodes(intent, data);
      const downstreamState = () => {
        if (analysisPhase === "complete") return "checked";
        if (analysisPhase === "error") return "irrelevant";
        return "checking";
      };

      processedData.nodes = data.nodes.map((node) => ({
        ...node,
        state: "irrelevant",
      }));

      const intentLower = intent.toLowerCase();
      const directMatches = data.nodes.filter((node) => {
        const nodeName = node.name.toLowerCase();
        return nodeName === intentLower;
      });

      directMatches.forEach((matchingNode) => {
        const nodeIndex = processedData.nodes.findIndex(
          (n) => n.name === matchingNode.name
        );
        if (nodeIndex !== -1) {
          processedData.nodes[nodeIndex].state = "intent-match";
        }
      });

      matchingNodes.forEach((matchingNode) => {
        const nodeIndex = processedData.nodes.findIndex(
          (n) => n.name === matchingNode.name
        );
        if (
          nodeIndex !== -1 &&
          processedData.nodes[nodeIndex].state !== "intent-match"
        ) {
          processedData.nodes[nodeIndex].state = downstreamState();
        }
      });

      if (analysisPhase === "complete") {
        processedData.nodes = processedData.nodes.map((node) => {
          if (node.state === "checking") {
            return {
              ...node,
              state: "checked",
            };
          }
          return node;
        });
      }
    } else {
      processedData.nodes = data.nodes.map((node) => ({
        ...node,
        state: "irrelevant",
      }));
    }

    try {
      viz.init().render(processedData);
      const controller = new SimulationController(viz);
      controller.setOriginalData(processedData);
      setSimulationController(controller);
    } catch (error) {
      console.error("Error creating visualization:", error);
    }
  }, [hexSize, intent, data, isMobile, analysisPhase]);

  useEffect(() => {
    if (
      simulationController &&
      !intent &&
      !simulationController.getIsRunning()
    ) {
      simulationController.start(() => {
        // no-op; animation is self contained
      });
    }
  }, [simulationController, intent]);

  const MobileLoadingAnimation = () => (
    <div className="radar-lite-mobile-loader">
      <div className="radar-lite-mobile-loader__hex">
        <svg viewBox="0 0 48 48" className="radar-lite-mobile-loader__outer">
          <polygon
            points="24,2 38,11 38,29 24,38 10,29 10,11"
            fill="none"
            stroke="#8B65FF"
            strokeWidth="2"
            opacity="0.8"
          />
        </svg>
        <svg viewBox="0 0 48 48" className="radar-lite-mobile-loader__inner">
          <polygon
            points="24,8 32,13 32,23 24,28 16,23 16,13"
            fill="#ED1651"
            stroke="#8B65FF"
            strokeWidth="1"
            opacity="0.6"
          />
          <polygon
            points="24,12 28,15 28,21 24,24 20,21 20,15"
            fill="#6AB7FF"
            opacity="0.3"
          />
        </svg>
      </div>
      <div className="radar-lite-mobile-loader__title">
        {textContent?.tree_analyzing_security_text || "Analyzing Security"}
      </div>
      <div className="radar-lite-mobile-loader__subtitle">
        {textContent?.tree_please_wait_text || "Please wait..."}
      </div>
    </div>
  );

  return (
    <div ref={containerRef} className="radar-lite-tree-container">
      {headerMessage && (
        <div className="radar-lite-tree-header">
          <h3>{headerMessage}</h3>
        </div>
      )}

      {isMobile ? (
        <MobileLoadingAnimation />
      ) : (
        <div className="radar-lite-tree-visualization">
          <div ref={svgRef} />
        </div>
      )}
    </div>
  );
};

export default TreeVisualizationComponent;
