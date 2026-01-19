import React from "react";

const getAction = (scope) => {
  switch (scope?.toUpperCase()) {
    case "COMPARE":
      return "Comparing";
    case "SINGLE":
    case "MULTI":
      return "Evaluating";
    default:
      return "Evaluating";
  }
};

const getSecurityType = (intent) => {
  switch (intent?.toLowerCase()) {
    case "email":
      return "email security";
    case "dns":
      return "domain security";
    case "web":
      return "web security";
    default:
      return "security";
  }
};

const formatInputs = (inputs) => {
  if (!Array.isArray(inputs)) {
    return null;
  }

  const sanitized = inputs
    .map((input) => (typeof input === "string" ? input.trim() : ""))
    .filter(Boolean);

  if (sanitized.length === 0) {
    return null;
  }

  if (sanitized.length === 1) {
    return sanitized[0];
  }

  if (sanitized.length === 2) {
    return `${sanitized[0]} and ${sanitized[1]}`;
  }

  const head = sanitized.slice(0, -1).join(", ");
  const tail = sanitized[sanitized.length - 1];
  return `${head} and ${tail}`;
};

const getIndustrySuffix = (industry, scope) => {
  if (!industry || scope?.toUpperCase() !== "SINGLE") {
    return "";
  }

  const normalized = industry.trim();
  if (!normalized || /^(unknown|irrelevance)$/i.test(normalized)) {
    return "";
  }

  const article = /^[aeiou]/i.test(normalized) ? "an" : "a";
  return `, ${article} ${normalized} domain`;
};

const buildHeading = ({ intent, scope, inputs, industry, placeholder }) => {
  if (placeholder) {
    return placeholder;
  }

  const action = getAction(scope);
  const securityType = getSecurityType(intent);
  const subjects = formatInputs(inputs) ?? "your request";
  const industrySuffix = getIndustrySuffix(industry, scope);

  return `${action} the ${securityType} of ${subjects}${industrySuffix}`;
};

export default function QueryHeader({ intent, scope, inputs, industry, placeholder }) {
  return (
    <h2 className="radar-lite-query-header">
      {buildHeading({ intent, scope, inputs, industry, placeholder })}
    </h2>
  );
}
