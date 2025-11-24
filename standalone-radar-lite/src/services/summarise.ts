import OpenAI from 'openai';

export type SummariseIntent = 'EMAIL' | 'DNS' | 'WEB' | 'ANY' | 'INVALID';

export type SummariseScope = 'SINGLE' | 'MULTI' | 'COMPARE' | 'NONE';

export interface SummariseArgs {
  query: string;
  userIntent: {
    intent: SummariseIntent;
    inputs: string[];
    scope: SummariseScope;
  };
  toolCalls: any;
}

export interface SummariseResult {
  message: string;
}

let cachedClient: OpenAI | null = null;

const getOpenAIClient = (): OpenAI => {
  if (cachedClient) {
    return cachedClient;
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  cachedClient = new OpenAI({
    apiKey,
  });

  return cachedClient;
};

export async function summariseLocally({
  query,
  userIntent,
  toolCalls,
}: SummariseArgs): Promise<SummariseResult> {
  try {
    if (!query) {
      throw new Error('query is required');
    }
    if (!userIntent) {
      throw new Error('userIntent is required');
    }
    if (!toolCalls) {
      throw new Error('toolCalls is required');
    }

    const filteredToolCalls = { ...toolCalls };
    console.log('Received summarise request with userIntent:', userIntent);
    if (
      toolCalls?.inputResults &&
      Array.isArray(toolCalls?.inputResults) &&
      toolCalls?.inputResults.length > 0
    ) {
      if (userIntent && userIntent.intent === 'INVALID') {
        console.log('User intent is INVALID, returning empty message');
        throw new Error('Invalid intent');
      }
      // Filter problematic tests based on user intent
      if (userIntent && userIntent.intent !== 'INVALID') {
        console.log(`Filtering tests for ${userIntent.intent} intent`);

        const getTestFilter = (intent: string) => {
          const filters: Record<string, (testType: string) => boolean> = {
            EMAIL: (testType) => testType.startsWith('email'),
            DNS: (testType) => testType.startsWith('domain_dns'),
            WEB: (testType) => testType.startsWith('www_'),
            ANY: (testType) =>
              testType.startsWith('domain_dns') ||
              testType.startsWith('email') ||
              testType.startsWith('www_'),
          };
          return filters[intent] || (() => true);
        };

        const testFilter = getTestFilter(userIntent.intent);
        filteredToolCalls.inputResults = toolCalls.inputResults.map(
          (result: {
            assessment: { problematic_tests: any[]; summary: any };
          }) => ({
            ...result,
            assessment: {
              summary: result.assessment.summary,
              problematic_tests: result.assessment.problematic_tests.filter(
                (test: { testType: string }) => testFilter(test.testType)
              ),
            },
          })
        );
      }
    }

    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: 'gpt-4.1-mini',
      stream: false,
      messages: [
        {
          role: 'system',
          content: `
            <CONTEXT>
                You are a helpful cybersecurity assistant specialized in email, web and DNS security.
                You are given a list of tests that are either 'neutral' or 'error' in 'quality' field.
                Neutral tests include measures that are not in place, but are not necessarily errors.
                Error tests indicate a failure in the security posture.
            </CONTEXT>
            <TESTS>
            ${JSON.stringify(filteredToolCalls)}
            </TESTS>
            <TASK>
                Your task is to create one report. 

                Create a 200 word summary of your analysis, highlight the most critical issues and their potential impact on the overall security posture.
            </TASK>
            `,
        },
        ...(query
          ? [
              {
                role: 'user' as const,
                content: query,
              },
            ]
          : []),
      ],
    });
    console.log(
      'OpenAI response received',
      response.usage?.completion_tokens,
      response.usage?.prompt_tokens
    );

    const message = response.choices[0].message.content || '';

    console.log('Returning summarise result', userIntent);
    return { message };
  } catch (error) {
    console.error('Error in summarise helper:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to summarise content');
  }
}
