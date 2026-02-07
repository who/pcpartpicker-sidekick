import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  ContentBlock,
  ToolUseBlock,
  ToolResultBlockParam,
  Tool,
  Message,
} from "@anthropic-ai/sdk/resources/messages";
import { PartCategory } from "./types.js";
import config from "./config.js";

const MODEL = "claude-opus-4-6";
const MAX_TOKENS = 4096;

const SYSTEM_PROMPT = `You are a PC build advisor assistant. You help users build custom PCs by understanding their needs, searching for parts on PCPartPicker, and proposing optimized builds within their budget.

## Available Part Categories
${Object.values(PartCategory)
  .map((c) => `- ${c}`)
  .join("\n")}

## Budget Strategy
- Optimize for price-to-performance ratio
- Respect user's brand preferences and exclusions
- Warn when selected parts total exceeds stated budget by more than 5%
- Allocate budget based on build purpose:
  - Gaming: prioritize GPU (~35-40%) and CPU (~20%)
  - Workstation: emphasize CPU and RAM more evenly
  - General: balanced allocation across categories
- Only allocate to categories the user actually needs

## Interaction Style
- Ask clarifying questions to understand the user's needs (budget, purpose, preferences)
- Provide reasoning for each part selection
- Present builds clearly with per-part cost breakdown
- Offer alternatives when trade-offs exist

## Tools
You have access to tools for searching parts, asking the user questions, proposing builds, and saving parts lists. Use them to fulfill the user's build request.`;

const TOOLS: Tool[] = [
  {
    name: "search_parts",
    description:
      "Search PCPartPicker for parts in a specific category with optional filters. Returns a list of matching parts with prices, ratings, and specs.",
    input_schema: {
      type: "object" as const,
      properties: {
        category: {
          type: "string",
          enum: Object.values(PartCategory),
          description: "The part category to search",
        },
        price_min: {
          type: "number",
          description: "Minimum price filter in USD",
        },
        price_max: {
          type: "number",
          description: "Maximum price filter in USD",
        },
        brand: {
          type: "string",
          description: "Filter by brand name",
        },
        min_rating: {
          type: "number",
          description: "Minimum rating (0-5)",
        },
      },
      required: ["category"],
    },
  },
  {
    name: "ask_user",
    description:
      "Ask the user a follow-up question to clarify their build requirements, preferences, or to present options.",
    input_schema: {
      type: "object" as const,
      properties: {
        question: {
          type: "string",
          description: "The question to ask the user",
        },
      },
      required: ["question"],
    },
  },
  {
    name: "propose_build",
    description:
      "Propose a complete PC build to the user with selected parts, prices, and reasoning for each choice.",
    input_schema: {
      type: "object" as const,
      properties: {
        parts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              category: { type: "string" },
              name: { type: "string" },
              price: { type: "number" },
              reasoning: { type: "string" },
              url: { type: "string" },
            },
            required: ["category", "name", "price", "reasoning"],
          },
          description: "The parts in the build proposal",
        },
        total: {
          type: "number",
          description: "Total cost of the build",
        },
        budget: {
          type: "number",
          description: "The user's stated budget",
        },
      },
      required: ["parts", "total", "budget"],
    },
  },
  {
    name: "save_list",
    description:
      "Save the approved build as a parts list on the user's PCPartPicker account.",
    input_schema: {
      type: "object" as const,
      properties: {
        list_name: {
          type: "string",
          description: "Name for the saved parts list",
        },
        parts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Part name" },
              url: { type: "string", description: "PCPartPicker URL for the part" },
              category: { type: "string", description: "Part category" },
            },
            required: ["name", "url", "category"],
          },
          description: "Parts to save (with PCPartPicker URLs)",
        },
      },
      required: ["list_name", "parts"],
    },
  },
];

export type ToolHandler = (
  input: Record<string, unknown>,
) => Promise<string>;

export class Agent {
  private client: Anthropic;
  private messages: MessageParam[] = [];
  private toolHandlers: Map<string, ToolHandler> = new Map();

  constructor() {
    this.client = new Anthropic({ apiKey: config.apiKey });
  }

  onTool(name: string, handler: ToolHandler): void {
    this.toolHandlers.set(name, handler);
  }

  async sendMessage(
    content: string,
    onText?: (text: string) => void,
  ): Promise<string> {
    this.messages.push({ role: "user", content });
    return this.runTurn(onText);
  }

  private async runTurn(onText?: (text: string) => void): Promise<string> {
    const stream = this.client.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages: this.messages,
    });

    if (onText) {
      stream.on("text", (text) => onText(text));
    }

    const response: Message = await stream.finalMessage();

    this.messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "tool_use") {
      const toolResults = await this.handleToolUse(response.content);
      this.messages.push({ role: "user", content: toolResults });
      return this.runTurn(onText);
    }

    return this.extractText(response.content);
  }

  private async handleToolUse(
    content: ContentBlock[],
  ): Promise<ToolResultBlockParam[]> {
    const toolBlocks = content.filter(
      (block): block is ToolUseBlock => block.type === "tool_use",
    );

    const results: ToolResultBlockParam[] = [];

    for (const block of toolBlocks) {
      const handler = this.toolHandlers.get(block.name);
      let result: string;
      let isError = false;

      if (handler) {
        try {
          result = await handler(block.input as Record<string, unknown>);
        } catch (err) {
          result =
            err instanceof Error ? err.message : "Tool execution failed";
          isError = true;
        }
      } else {
        result = `No handler registered for tool: ${block.name}`;
        isError = true;
      }

      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: result,
        is_error: isError,
      });
    }

    return results;
  }

  private extractText(content: ContentBlock[]): string {
    return content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
  }
}
