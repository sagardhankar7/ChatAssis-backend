import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

export async function promptTitleFinder(userPromptMessage) {
    const messages = [
        {
            role: "system",
            content: `You are a smart personal assistant who answer the asked questions.
            You have to suggest under 5 words title for the user query 
          `,
        },
    ]

    messages.push({
        role: "user",
        content: userPromptMessage
    })

    const chatCompletion = await groq.chat.completions.create({
        temperature: 0,
        messages: messages,
        model: "openai/gpt-oss-120b",
        //   max_completion_tokens: 7800,
    })

    const titleBlock = chatCompletion.choices[0].message.content
    // console.log("Title: ",titleBlock, "Title to send in response : ", extractTitle(titleBlock))
    return extractTitle(titleBlock)
}

function extractTitle(text) {
    // Matches: **Title:** something   OR   Title: something
    const match = text.match(/\*{0,2}Title:\*{0,2}\s*(.+)/i);
    if (!match) return text.trim(); // fallback: return whole text if pattern not found

    return match[1]
        .trim()
        .replace(/^["'*]+|["'*]+$/g, ""); // strip stray quotes/asterisks at edges
}