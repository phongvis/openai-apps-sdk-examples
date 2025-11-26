type QueryHeaderProps = {
  intent: string | null;
  scope: string | null;
  inputs: string[];
  industry: string | null;
};

const getAction = (scope: string | null) => {
  switch (scope?.toUpperCase()) {
    case 'COMPARE':
      return 'Comparing';
    case 'SINGLE':
    case 'MULTI':
      return 'Evaluating';
    default:
      return 'Evaluating';
  }
};

const getSecurityType = (intent: string | null) => {
  switch (intent?.toLowerCase()) {
    case 'email':
      return 'email security';
    case 'dns':
      return 'domain security';
    case 'web':
      return 'web security';
    default:
      return 'security';
  }
};

const formatInputs = (inputs: string[]): string | null => {
  const sanitized = inputs
    .map((input) => input?.trim())
    .filter((value): value is string => Boolean(value));

  if (sanitized.length === 0) {
    return null;
  }

  if (sanitized.length === 1) {
    return sanitized[0];
  }

  if (sanitized.length === 2) {
    return `${sanitized[0]} and ${sanitized[1]}`;
  }

  const head = sanitized.slice(0, -1).join(', ');
  const tail = sanitized[sanitized.length - 1];
  return `${head} and ${tail}`;
};

const getIndustrySuffix = (industry: string | null, scope: string | null) => {
  if (!industry || scope?.toUpperCase() !== 'SINGLE') {
    return '';
  }

  const normalized = industry.trim();
  if (!normalized || /^(unknown|irrelevance)$/i.test(normalized)) {
    return '';
  }

  const article = /^[aeiou]/i.test(normalized) ? 'an' : 'a';
  return `, ${article} ${normalized} domain`;
};

const buildHeading = ({
  intent,
  scope,
  inputs,
  industry,
}: QueryHeaderProps) => {
  const action = getAction(scope);
  const securityType = getSecurityType(intent);
  const subjects = formatInputs(inputs) ?? 'your request';
  const industrySuffix = getIndustrySuffix(industry, scope);

  return `${action} the ${securityType} of ${subjects}${industrySuffix}`;
};

export default function QueryHeader(props: QueryHeaderProps) {
  return (
    <div className="query-header">
      <h2>{buildHeading(props)}</h2>
    </div>
  );
}
