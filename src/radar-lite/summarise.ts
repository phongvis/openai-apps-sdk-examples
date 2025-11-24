/// <reference types="node" />

import OpenAI from "openai";

export type SummariseIntent = "EMAIL" | "DNS" | "WEB" | "ANY" | "INVALID";

export type SummariseScope = "SINGLE" | "MULTI" | "COMPARE" | "NONE";

export interface SummariseArgs {
  query: string;
  userIntent: {
    intent: SummariseIntent;
    inputs: string[];
    scope: SummariseScope;
  };
  toolCalls: unknown;
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
    throw new Error("OPENAI_API_KEY is not set");
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
  if (!query) {
    throw new Error("query is required");
  }
  if (!userIntent) {
    throw new Error("userIntent is required");
  }
  if (!toolCalls) {
    throw new Error("toolCalls is required");
  }

  const filteredToolCalls = { ...(toolCalls as Record<string, unknown>) };

  if (
    userIntent.intent === "INVALID" ||
    !Array.isArray((toolCalls as { inputResults?: unknown[] }).inputResults)
  ) {
    if (userIntent.intent === "INVALID") {
      throw new Error("Invalid intent");
    }
  } else {
    const { inputResults } = toolCalls as {
      inputResults: Array<{
        assessment: {
          problematic_tests: Array<{ testType: string }>;
          summary: unknown;
        };
      }>;
    };

    const getTestFilter = (intent: SummariseIntent) => {
      const filters: Record<SummariseIntent, (testType: string) => boolean> = {
        EMAIL: (testType) => testType.startsWith("email"),
        DNS: (testType) => testType.startsWith("domain_dns"),
        WEB: (testType) => testType.startsWith("www_"),
        ANY: (testType) =>
          testType.startsWith("domain_dns") ||
          testType.startsWith("email") ||
          testType.startsWith("www_"),
        INVALID: () => false,
      };

      return filters[intent] ?? (() => true);
    };

    const filter = getTestFilter(userIntent.intent);
    filteredToolCalls.inputResults = inputResults.map((result) => ({
      ...result,
      assessment: {
        summary: result.assessment.summary,
        problematic_tests: result.assessment.problematic_tests.filter((test) =>
          filter(test.testType)
        ),
      },
    }));
  }

  const client = getOpenAIClient();
  const response = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    stream: false,
    messages: [
      {
        role: "system",
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
              role: "user" as const,
              content: query,
            },
          ]
        : []),
    ],
  });

  const message = response.choices[0].message.content || "";
  return { message };
}
