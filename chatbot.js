import Groq from "groq-sdk"
import { tavily } from "@tavily/core"

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY })

export async function generate(userMessage) {
  const messages = [
    {
      role: "system",
      content: `You are a smart personal assistant who answer the asked questions.
          You have access to following tools:
          1. webSearch({query} : {query: string}) //Search the latest information and realtime data on internet`,
    },
  ]

  messages.push({
    role: "user",
    content: userMessage,
  })

  while (true) {
    const chatCompletion = await groq.chat.completions.create({
      temperature: 0,
      messages: messages,
      model: "openai/gpt-oss-120b",
      max_completion_tokens: 8192,
      tools: [
        {
          type: "function",
          function: {
            name: "webSearch",
            description:
              "Search the latest information and realtime data on internet",
            parameters: {
              // JSON Schema object
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "The search query.",
                },
              },
              required: ["query"],
            },
          },
        },
      ],
      tool_choice: "auto",
    })

    messages.push(chatCompletion.choices[0].message)

    const toolCalls = chatCompletion.choices[0]?.message.tool_calls

    //   Handle Tool Call

    if (!toolCalls) {
      // ai generated answer by itself without need of tool call
      return chatCompletion.choices[0].message.content
    }

    for (const tool of toolCalls) {
      // console.log("tool: ", tool);
      const functionName = tool.function.name
      const functionArgs = tool.function.arguments

      if (functionName === "webSearch") {
        const toolResult = await toolWebSearch(JSON.parse(functionArgs))

        messages.push({
          role: "tool",
          tool_call_id: tool.id,
          content: toolResult,
          name: functionName,
        })
        // console.log("Tool Result:", toolResult);
      }
    }
  }
}

async function toolWebSearch({ query }) {
  //   console.log("Calling Tool: toolWebSearch", query);
  const response = await tvly.search(query, {
    maxResults: 3,
  })

  const finalResponse = response.results
    .map((result) => result.content.slice(0, 5000))
    .join("\n\n")
  return finalResponse
}
