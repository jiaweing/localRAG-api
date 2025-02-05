import type { Context } from "hono";
import { LlamaChatSession, TemplateChatWrapper } from "node-llama-cpp";
import { loadModel } from "./models.js";

// Map to store chat sessions
const chatSessions = new Map<string, LlamaChatSession>();
const sessionCreationTimes = new Map<string, number>();

// Clean up old sessions after 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, creationTime] of sessionCreationTimes.entries()) {
    if (now - creationTime > 30 * 60 * 1000) {
      chatSessions.delete(sessionId);
      sessionCreationTimes.delete(sessionId);
    }
  }
}, 15 * 60 * 1000);

// Core chat completion function that can be used by both endpoint and other functions
export async function createChatCompletion({
  model,
  messages,
  temperature = 0.7,
  max_tokens,
  stream = false,
}: {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}) {
  if (!model || !Array.isArray(messages) || messages.length === 0) {
    throw new Error("Missing required parameters: model, messages (array)");
  }

  // Create a template chat wrapper for consistent formatting
  const chatWrapper = new TemplateChatWrapper({
    template: "{{systemPrompt}}\n{{history}}Assistant: {{completion}}\nHuman: ",
    historyTemplate: {
      system: "System: {{message}}\n",
      user: "Human: {{message}}\n",
      model: "Assistant: {{message}}\n",
    },
  });

  const modelContext = await loadModel(model, "chat");
  const sessionId = `${model}-${Date.now()}`;

  // Process messages
  let systemPrompt = "";
  for (const msg of messages) {
    if (msg.role === "system") {
      systemPrompt = msg.content;
    }
  }

  // Create or get existing chat session
  let session = chatSessions.get(sessionId);
  if (!session) {
    // Create a new context and session
    const context = await modelContext.model.createContext();
    session = new LlamaChatSession({
      systemPrompt,
      contextSequence: context.getSequence(),
      chatWrapper,
    });
    chatSessions.set(sessionId, session);
    sessionCreationTimes.set(sessionId, Date.now());
  }

  if (stream) {
    throw new Error("Streaming not supported in function mode");
  } else {
    // Non-streaming response
    const response = await session.prompt(
      messages[messages.length - 1].content,
      {
        temperature,
        maxTokens: max_tokens,
      }
    );

    return {
      id: sessionId,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: response,
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: -1,
        completion_tokens: -1,
        total_tokens: -1,
      },
    };
  }
}

// Endpoint handler that uses the core chat completion function
export async function handleChatCompletion(c: Context) {
  try {
    const {
      model,
      messages,
      temperature,
      max_tokens,
      stream = false,
    } = await c.req.json();

    if (!model || !Array.isArray(messages) || messages.length === 0) {
      return c.json(
        {
          error: {
            message: "Missing required parameters: model, messages (array)",
            type: "invalid_request_error",
            param: !model ? "model" : "messages",
            code: null,
          },
        },
        400
      );
    }

    return c.json(
      await createChatCompletion({
        model,
        messages,
        temperature,
        max_tokens,
        stream,
      })
    );
  } catch (error: unknown) {
    console.error("Error generating chat completion:", error);
    if (
      error instanceof Error &&
      "code" in error &&
      (error as any).code === "ENOENT"
    ) {
      return c.json(
        {
          error: {
            message: `Model '${
              (error as any).path
            }' not found in models directory`,
            type: "invalid_request_error",
            param: "model",
            code: "model_not_found",
          },
        },
        404
      );
    }
    return c.json(
      {
        error: {
          message:
            error instanceof Error ? error.message : "Unknown error occurred",
          type: "server_error",
          param: null,
          code: null,
        },
      },
      500
    );
  }
}
