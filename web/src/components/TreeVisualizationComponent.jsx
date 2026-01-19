import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

// TreeVisualization class converted to work with React
class TreeVisualization {
  constructor(container, options = {}) {
    this.container = d3.select(container);
    this.options = {
      nodeRadius: 20,
      margins: { top: 50, right: 50, bottom: 50, left: 50 },
      ...options,
    };
    this.svg = null;
    this.data = null;

    // Create off-screen canvas for text measurement
    try {
      this.canvas = document.createElement("canvas");
      this.context = this.canvas.getContext("2d");
    } catch (e) {
      // Fallback handled in _getNodeWidth
      this.context = null;
    }
  }

  init() {
    // Clear any existing SVG first
    this.container.selectAll("svg").remove();

    this.svg = this.container.append("svg");

    // Add defs for the animated gradient (matching Figma animation)
    const defs = this.svg.append("defs");

    // Mask gradient (static - for the alpha mask effect)
    const maskGradient = defs
      .append("linearGradient")
      .attr("id", "radar_mask_gradient")
      .attr("x1", "115")
      .attr("y1", "179")
      .attr("x2", "185.051")
      .attr("y2", "102.019")
      .attr("gradientUnits", "userSpaceOnUse");

    maskGradient.append("stop").attr("stop-color", "#ED1553");
    maskGradient
      .append("stop")
      .attr("offset", "0.497292")
      .attr("stop-color", "#8C65FF");
    maskGradient
      .append("stop")
      .attr("offset", "1")
      .attr("stop-color", "#6BB7FF");

    // Define the mask
    const mask = defs
      .append("mask")
      .attr("id", "radar_alpha_mask")
      .attr("style", "mask-type:alpha")
      .attr("maskUnits", "userSpaceOnUse")
      .attr("x", "-75")
      .attr("y", "-80")
      .attr("width", "116")
      .attr("height", "113");

    mask
      .append("rect")
      .attr("x", "-75")
      .attr("y", "-80")
      .attr("width", "116")
      .attr("height", "113")
      .attr("fill", "url(#radar_mask_gradient)");

    // Animated fill gradient - uses objectBoundingBox for proper rendering
    const fillGradient = defs
      .append("linearGradient")
      .attr("id", "radar_animated_gradient")
      .attr("x1", "0%")
      .attr("y1", "100%")
      .attr("x2", "100%")
      .attr("y2", "0%");

    fillGradient
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", "#ED1553");
    fillGradient
      .append("stop")
      .attr("offset", "50%")
      .attr("stop-color", "#8C65FF");
    fillGradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "#6BB7FF");

    // Legacy gradient for fallback (original static gradient)
    const legacyGradient = defs
      .append("linearGradient")
      .attr("id", "paint0_linear_17498_128924")
      .attr("x1", "18.4079")
      .attr("y1", "65.8776")
      .attr("x2", "62.9816")
      .attr("y2", "44.2855")
      .attr("gradientUnits", "userSpaceOnUse");

    legacyGradient
      .append("stop")
      .attr("offset", "0.0132799")
      .attr("stop-color", "#ED1553");
    legacyGradient
      .append("stop")
      .attr("offset", "0.497292")
      .attr("stop-color", "#8C65FF");
    legacyGradient
      .append("stop")
      .attr("offset", "1")
      .attr("stop-color", "#6BB7FF");

    return this;
  }

  render(graph) {
    if (!this.svg) {
      this.init();
    }

    this.data = graph;

    // Clear content but keep defs
    this.svg.selectAll("g").remove();

    const dimensions = this._calculateDimensions();
    const offsetX = -50; // Shift viewBox to show more of the left side
    this.svg
      .attr("width", "100%")
      .attr("height", "100%")
      .attr("viewBox", [
        -dimensions.width / 2 + offsetX,
        -dimensions.height / 2,
        dimensions.width,
        dimensions.height,
      ]);

    const layoutData = this._calculateLayout(graph, dimensions);

    this._drawLinks(layoutData);
    this._drawNodes(layoutData);

    return this;
  }

  update(graph) {
    return this.render(graph);
  }

  _getNodeWidth(d) {
    // Controls node width based on text length
    if (d.depth === 0) return this.options.nodeRadius * 2;

    const text = d.displayName || d.name;

    // Use canvas to measure actual text width if available
    if (this.context) {
      const isHub = d.isHub;
      // Font settings matching CSS - use system fonts
      const fontSize = isHub ? "20px" : "16px";
      const fontFamily = 'ui-sans-serif, -apple-system, system-ui, "Segoe UI", "Noto Sans", sans-serif';
      const fontWeight = isHub ? "500" : "400";

      this.context.font = `${fontWeight} ${fontSize} ${fontFamily}`;
      const metrics = this.context.measureText(text);

      // Padding:
      // Child nodes: 25px left (includes dot) + 20px right = 45px
      // Hub nodes: Centered, ~20px each side = 40px
      const padding = isHub ? 40 : 45;
      return Math.max(90, metrics.width + padding);
    }

    // Fallback
    return Math.max(90, text.length * 7 + 40);
  }

  _calculateDimensions() {
    // Fixed large canvas to accommodate the spread layout
    // The viewBox will handle the scaling/centering
    return {
      width: 1600,
      height: 800,
      margins: this.options.margins,
    };
  }

  _calculateLayout(graph, dimensions) {
    // 1. Identify Nodes
    const rootNode = graph.nodes.find((n) => n.name === "ANY");
    const emailNode = graph.nodes.find((n) => n.name === "EMAIL");
    const dnsNode = graph.nodes.find((n) => n.name === "DNS");
    const webNode = graph.nodes.find((n) => n.name === "WEB");

    if (!rootNode) return { nodes: [], links: [] };

    // Helper to get children from flat data
    const getChildren = (node) => {
      return graph.links
        .filter((l) => l.source === node.name)
        .map((l) => graph.nodes.find((n) => n.name === l.target));
    };

    // 2. Assign Positions (Relative to Center 0,0)
    const nodes = [];
    const links = [];

    // Helper to add node with position
    const addNode = (node, x, y, depth, parent = null) => {
      // Check if node already exists to avoid duplicates
      const existing = nodes.find((n) => n.name === node.name);
      if (existing) return existing;

      const isHub = ["EMAIL", "DNS", "WEB"].includes(node.name);
      const n = { ...node, x, y, depth, parent, isHub };
      nodes.push(n);
      if (parent) {
        links.push({ source: parent, target: n });
      }
      return n;
    };

    // Root - centered
    const root = addNode(rootNode, 0, -120, 0);

    // Level 1 Hubs - wider separation
    const hubY = -120;
    const hubSpacing = 160; // Increased from 120
    const email = emailNode ? addNode(emailNode, -hubSpacing, hubY, 1, root) : null;
    const dns = dnsNode ? addNode(dnsNode, hubSpacing, hubY, 1, root) : null;
    const web = webNode ? addNode(webNode, 0, 40, 1, root) : null;

    // Level 2+ Children (Recursive Layouts)

    // EMAIL Subtree (Left) - wider node spacing
    if (email) {
      const hierarchy = d3.hierarchy(emailNode, getChildren);
      const treeLayout = d3.tree().nodeSize([55, 180]); // Increased horizontal spacing
      const treeRoot = treeLayout(hierarchy);

      treeRoot.descendants().forEach((d) => {
        if (d.data.name === "EMAIL") return; // Skip root (already added)

        // Rotate: x becomes y, y becomes x (inverted for Left)
        const x = -hubSpacing - d.y - 60; // More separation from hub
        const y = hubY + d.x;

        const parent = nodes.find((n) => n.name === d.parent.data.name);
        addNode(d.data, x, y, d.depth + 1, parent);
      });
    }

    // DNS Subtree (Right) - wider node spacing
    if (dns) {
      const hierarchy = d3.hierarchy(dnsNode, getChildren);
      const treeLayout = d3.tree().nodeSize([55, 180]); // Increased horizontal spacing
      const treeRoot = treeLayout(hierarchy);

      treeRoot.descendants().forEach((d) => {
        if (d.data.name === "DNS") return;

        // Right direction
        const x = hubSpacing + d.y + 60; // More separation from hub
        const y = hubY + d.x;

        const parent = nodes.find((n) => n.name === d.parent.data.name);
        addNode(d.data, x, y, d.depth + 1, parent);
      });
    }

    // WEB Children (Bottom, split Left/Right)
    if (web) {
      const webChildren = getChildren(webNode);

      // Split roughly in half
      const mid = Math.ceil(webChildren.length / 2);
      const leftGroup = webChildren.slice(0, mid);
      const rightGroup = webChildren.slice(mid);

      const webChildSpacing = 55; // Vertical spacing between WEB children
      const webColumnOffset = 180; // Horizontal offset from center

      // Left Group
      leftGroup.forEach((child, i) => {
        addNode(child, -webColumnOffset, 110 + i * webChildSpacing, 2, web);
      });

      // Right Group
      rightGroup.forEach((child, i) => {
        addNode(child, webColumnOffset, 110 + i * webChildSpacing, 2, web);
      });
    }

    return { nodes, links, descendants: () => nodes, linksFn: () => links };
  }

  _drawLinks(layoutData) {
    const linksGroup = this.svg.append("g").attr("class", "links");
    let linkIndex = 0;

    layoutData.links.forEach((d) => {
      const source = d.source;
      const target = d.target;

      // Calculate path based on relationship
      let pathD = "";

      // Root -> Hubs
      if (source.depth === 0) {
        // Straight lines to hubs
        pathD = `M${source.x},${source.y} L${target.x},${target.y}`;
      }
      // Web Children (Vertical/Split)
      else if (source.name === "WEB") {
        // Elbow connector: Vertical -> Horizontal -> Vertical
        pathD = `M${source.x},${source.y} 
                   L${target.x},${source.y} 
                   L${target.x},${target.y}`;
      }
      // Email/DNS Subtrees (Horizontal Elbows)
      else {
        // Elbow connector: Horizontal -> Vertical -> Horizontal
        const midX = (source.x + target.x) / 2;
        pathD = `M${source.x},${source.y} 
                   L${midX},${source.y} 
                   L${midX},${target.y} 
                   L${target.x},${target.y}`;
      }

      const pathId = `tree-link-${linkIndex}`;
      const state = target.state || "irrelevant";
      const isActive =
        state === "checking" ||
        state === "intent-match" ||
        state === "checked" ||
        state === "impacted";

      linksGroup
        .append("path")
        .attr("id", pathId)
        .attr("class", `tree-link state-${state}`)
        .attr("d", pathD);

      // Add animated traveling dots for active links (continuous motion)
      if (isActive) {
        const path = linksGroup.select(`#${pathId}`).node();
        if (path) {
          const pathLength = path.getTotalLength();
          const dotCount = 3;
          const duration = 1600;

          for (let i = 0; i < dotCount; i++) {
            const dot = linksGroup
              .append("circle")
              .attr("r", 3)
              .attr("fill", "#4D87FF")
              .attr("class", "traveling-dot")
              .attr("opacity", 1);

            const startDelay = (duration / dotCount) * i;

            const animateDot = () => {
              dot
                .attr("opacity", 1)
                .transition()
                .duration(duration)
                .ease(d3.easeLinear)
                .attrTween("transform", () => {
                  return (t) => {
                    // Reverse direction: move toward root (1-t instead of t)
                    const point = path.getPointAtLength((1 - t) * pathLength);
                    return `translate(${point.x}, ${point.y})`;
                  };
                })
                .on("end", animateDot);
            };

            setTimeout(animateDot, startDelay);
          }
        }
      }

      linkIndex++;
    });
  }

  _drawNodes(layoutData) {
    const nodes = this.svg
      .append("g")
      .attr("class", "nodes")
      .selectAll("g")
      .data(layoutData.nodes)
      .join("g")
      .attr("class", (d) => {
        const stateClass = "node state-" + (d.state || "irrelevant");
        const depthClass = d.depth === 0 ? " root-node" : "";
        const typeClass =
          d.depth > 0 ? (d.isHub ? " hub-node" : " child-node") : "";
        return `${stateClass}${depthClass}${typeClass}`;
      })
      .attr("transform", (d) => `translate(${d.x},${d.y})`);

    // Root Node: Animated SVG Icon with gradient
    const rootNodes = nodes.filter((d) => d.depth === 0);

    // Create a group for the animated icon - no transform, draw at correct size
    const rootGroup = rootNodes
      .append("g")
      .attr("class", "radar-icon-animated");

    // Draw the hexagon icon directly at the correct size (approx 80px)
    // The icon consists of: outer hexagon (gradient) + white inner hex + gradient star
    
    const scale = 0.4;
    const cx = 99;  // Original center X
    const cy = 93;  // Original center Y
    
    // Helper to transform path coordinates
    const transformPath = (pathStr) => {
      // This is a simplified approach - just use the paths as-is with a transform on the group
      return pathStr;
    };

    // Instead of complex path transforms, use a nested SVG with viewBox
    const iconSize = 80;
    const nestedSvg = rootGroup
      .append("svg")
      .attr("x", -iconSize / 2)
      .attr("y", -iconSize / 2)
      .attr("width", iconSize)
      .attr("height", iconSize)
      .attr("viewBox", "40 40 120 110")
      .attr("overflow", "visible");

    // Add defs inside the nested SVG for proper gradient coordinates
    const nestedDefs = nestedSvg.append("defs");

    // Fill gradient with userSpaceOnUse coordinates matching the viewBox
    const fillGradient = nestedDefs
      .append("linearGradient")
      .attr("id", "radar_icon_gradient")
      .attr("x1", "60")
      .attr("y1", "150")
      .attr("x2", "150")
      .attr("y2", "60")
      .attr("gradientUnits", "userSpaceOnUse");

    fillGradient
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", "#ED1553");
    fillGradient
      .append("stop")
      .attr("offset", "50%")
      .attr("stop-color", "#8C65FF");
    fillGradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "#6BB7FF");

    // White background hexagon
    nestedSvg
      .append("path")
      .attr("fill", "#FFFFFF")
      .attr(
        "d",
        "M125.138 42.4453C127.187 42.4438 129.075 43.5338 130.099 45.3091L155.904 90.0008C156.923 91.7735 156.926 93.9592 155.903 95.7314L130.098 140.425C129.075 142.198 127.181 143.288 125.139 143.287L73.5296 143.289C71.4831 143.286 69.5952 142.196 68.5693 140.426L42.7661 95.7294C41.7402 93.9587 41.7419 91.7758 42.7651 90.0036L68.5692 45.3096C69.5924 43.5374 71.482 42.4443 73.5312 42.4428L125.138 42.4453Z"
      );

    // Gradient hexagon with star cutout
    nestedSvg
      .append("path")
      .attr("fill-rule", "evenodd")
      .attr("clip-rule", "evenodd")
      .attr(
        "d",
        "M125.138 42.4453C127.187 42.4438 129.075 43.5338 130.099 45.3091L155.904 90.0008C156.923 91.7735 156.926 93.9592 155.903 95.7314L130.098 140.425C129.075 142.198 127.181 143.288 125.139 143.287L73.5296 143.289C71.4831 143.286 69.5952 142.196 68.5693 140.426L42.7661 95.7294C41.7402 93.9587 41.7419 91.7758 42.7651 90.0036L68.5692 45.3096C69.5924 43.5374 71.482 42.4443 73.5312 42.4428L125.138 42.4453ZM85.0768 107.121L94.6181 123.636C95.1259 124.509 96.0513 125.044 97.0567 125.044L101.614 125.047C102.627 125.046 103.554 124.508 104.057 123.638L113.594 107.119L130.106 97.5822C130.979 97.0745 131.514 96.1491 131.514 95.1437L131.513 90.5834C131.516 89.5735 130.978 88.6461 130.108 88.1439L113.589 78.6066L104.048 62.0913C103.545 61.2209 102.614 60.6839 101.609 60.6834L97.049 60.685C96.0436 60.6845 95.116 61.2225 94.6137 62.0924L85.0764 78.6115L68.5614 88.1528C67.691 88.6559 67.154 89.5859 67.1535 90.5913L67.1504 95.1489C67.1499 96.1542 67.6925 97.0844 68.5624 97.5866L85.0768 107.121ZM86.2147 79.7498L91.5575 79.7497C92.1394 79.7463 92.675 79.4385 92.9662 78.9341L99.3323 67.9077L105.701 78.9325C105.989 79.4381 106.53 79.7507 107.112 79.7473L112.448 79.7494L112.451 85.0876C112.449 85.6668 112.759 86.2096 113.266 86.4961L124.293 92.8623L113.268 99.2311C112.759 99.5237 112.45 100.06 112.453 100.642L112.448 105.983L107.113 105.981C106.531 105.984 105.988 106.294 105.697 106.798L99.338 117.823L92.9694 106.798C92.6741 106.294 92.1373 105.984 91.5581 105.983L86.2151 105.983L86.2197 100.643C86.2163 100.061 85.904 99.5226 85.3996 99.2314L74.3777 92.8679L85.4026 86.4994C85.9036 86.2087 86.2162 85.6672 86.2175 85.088L86.2147 79.7498Z"
      )
      .attr("fill", "url(#radar_icon_gradient)");

    // Other Nodes: Pills (Rounded Rectangles)
    const otherNodes = nodes.filter((d) => d.depth > 0);

    const pillHeight = 38;
    const pillRadius = 19;

    otherNodes
      .append("rect")
      .attr("rx", pillRadius)
      .attr("ry", pillRadius)
      .attr("width", (d) => this._getNodeWidth(d))
      .attr("height", pillHeight)
      .attr("x", (d) => -this._getNodeWidth(d) / 2)
      .attr("y", -pillHeight / 2)
      .attr("class", "node-pill");

    // Single Dot for non-hubs
    otherNodes
      .filter((d) => !d.isHub)
      .append("circle")
      .attr("class", "node-dot")
      .attr("r", 3) // 6px diameter
      .attr("cx", (d) => -this._getNodeWidth(d) / 2 + 16) // 13px padding + 3px radius
      .attr("cy", 0);

    // Text for Pills - all text centered horizontally
    otherNodes
      .append("text")
      .attr("dy", "0.35em") // Center vertically
      .attr("text-anchor", "middle")
      .attr("x", 0) // Center in pill
      .text((d) => d.displayName || d.name);
  }
}

// SimulationController class
class SimulationController {
  constructor(visualization, options = {}) {
    this.visualization = visualization;
    this.options = {
      stepDelay: 7000,
      initialDelay: 1000,
      nodeCount: 10,
      holdAnalysisMode: false,
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
    resetData.nodes.forEach((node) => {
      if (node.state !== "impacted") {
        node.state = "irrelevant";
      }
    });
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

      if (this.options.holdAnalysisMode) {
        statusCallback("Analysis mode held for review");
        this.isRunning = false;
        return;
      }

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
      if (node && node.state !== "impacted") {
        // Don't overwrite impacted state
        node.state = state;

        // Propagate to ancestors
        this._propagateStateToAncestors(data, nodeName, state);
      }
    });
  }

  _propagateStateToAncestors(data, childName, state) {
    const link = data.links.find((l) => l.target === childName);
    if (!link) return;

    const parentName = link.source;
    if (parentName === "ANY") return; // Don't color the root

    const parentNode = data.nodes.find((n) => n.name === parentName);
    if (parentNode && parentNode.state !== "impacted") {
      // If it's a Hub, make it Dark Red (intent-match) to be prominent
      if (["EMAIL", "DNS", "WEB"].includes(parentName)) {
        parentNode.state = "intent-match";
      } else {
        parentNode.state = state;
      }

      // Recurse up
      this._propagateStateToAncestors(data, parentName, state);
    }
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

const HOLD_ANALYSIS_FOR_REVIEW = true;

// React Component - Compatible with widget architecture
const TreeVisualizationComponent = ({
  intent = null,
  data = sampleData,
  headerMessage = null,
  textContent = null,
  analysisPhase = "idle",
  disableSimulation = false,
}) => {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [hexSize, setHexSize] = useState(10);
  const [simulationController, setSimulationController] = useState(null);
  const [isMobile, setIsMobile] = useState(false);

  // Check screen size and adjust hex size
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

  // Function to find nodes that match the intent
  const findMatchingNodes = (currentIntent, currentData) => {
    if (!currentIntent) return [];

    const intentLower = currentIntent.toLowerCase();

    // Find direct matches
    const directMatches = currentData.nodes.filter((node) => {
      const nodeName = node.name.toLowerCase();
      return nodeName === intentLower;
    });

    // Now find all downstream nodes from the direct matches
    const allMatchingNodes = new Set(directMatches);

    // Function to recursively find all downstream nodes
    const findDownstreamNodes = (nodeName) => {
      const downstreamLinks = currentData.links.filter(
        (link) => link.source === nodeName
      );
      downstreamLinks.forEach((link) => {
        const targetNode = currentData.nodes.find(
          (n) => n.name === link.target
        );
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

    // Clear any existing content
    d3.select(svgRef.current).selectAll("*").remove();

    const viz = new TreeVisualization(svgRef.current, {
      nodeRadius: hexSize,
    });

    // Prepare data with intent-based highlighting
    const processedData = { ...data };

    if (intent) {
      const matchingNodes = findMatchingNodes(intent, data);

      // Determine downstream state based on analysis phase
      const downstreamState = () => {
        if (analysisPhase === "complete") return "checked";
        if (analysisPhase === "error") return "irrelevant";
        return "checking";
      };

      // Reset all nodes to irrelevant first
      processedData.nodes = data.nodes.map((node) => ({
        ...node,
        state: "irrelevant",
      }));

      // Find direct matches first
      const intentLower = intent.toLowerCase();
      const directMatches = data.nodes.filter((node) => {
        const nodeName = node.name.toLowerCase();
        return nodeName === intentLower;
      });

      // Highlight direct matches
      directMatches.forEach((matchingNode) => {
        const nodeIndex = processedData.nodes.findIndex(
          (n) => n.name === matchingNode.name
        );
        if (nodeIndex !== -1) {
          const isHub = ["EMAIL", "DNS", "WEB"].includes(
            processedData.nodes[nodeIndex].name
          );
          processedData.nodes[nodeIndex].state = isHub
            ? "intent-match"
            : "checking";
        }
      });

      // Highlight downstream nodes (those that are not direct matches)
      matchingNodes.forEach((matchingNode) => {
        const nodeIndex = processedData.nodes.findIndex(
          (n) => n.name === matchingNode.name
        );
        if (
          nodeIndex !== -1 &&
          processedData.nodes[nodeIndex].state !== "intent-match"
        ) {
          // If it's a Hub node, promote it to intent-match (Dark Red)
          if (
            ["EMAIL", "DNS", "WEB"].includes(
              processedData.nodes[nodeIndex].name
            )
          ) {
            processedData.nodes[nodeIndex].state = "intent-match";
          } else {
            processedData.nodes[nodeIndex].state = downstreamState();
          }
        }
      });

      // When analysis is complete, transition checking -> checked
      if (analysisPhase === "complete") {
        processedData.nodes = processedData.nodes.map((node) => {
          if (node.state === "checking") {
            return { ...node, state: "checked" };
          }
          return node;
        });
      }
    } else {
      // If no intent, reset all nodes to irrelevant
      processedData.nodes = data.nodes.map((node) => ({
        ...node,
        state: "irrelevant",
      }));
    }

    try {
      viz.init().render(processedData);

      // Create simulation controller with processed data
      const controller = new SimulationController(viz, {
        holdAnalysisMode: HOLD_ANALYSIS_FOR_REVIEW,
      });
      controller.setOriginalData(processedData);
      setSimulationController(controller);
    } catch (error) {
      console.error("Error creating visualization:", error);
    }
  }, [hexSize, intent, data, isMobile, analysisPhase]);

  // Auto-start simulation when component mounts (only if no intent and simulation not disabled)
  useEffect(() => {
    if (
      simulationController &&
      !intent &&
      !disableSimulation &&
      !simulationController.getIsRunning()
    ) {
      simulationController.start(() => {
        // no-op; animation is self contained
      });
    }
  }, [simulationController, intent, disableSimulation]);

  // Mobile loading animation fallback
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
          <div ref={svgRef} style={{ width: "100%", height: "100%" }} />
        </div>
      )}
    </div>
  );
};

export default TreeVisualizationComponent;
