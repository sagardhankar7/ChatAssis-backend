import express, { response } from "express"
import { generate } from "./chatbot.js"
import cors from "cors"
import multer from "multer"
import path from "path"
import { indexTheDocument, vectorStore } from "./PdfAi.js"
import OpenAI from "openai"
import NodeCache from "node-cache";
import {promptTitleFinder} from "./promptTitleFinder.js";
const db = new NodeCache({ stdTTL: 60 * 60 * 24 }) // 24 HOUR TTL
const userChatRoutes = new NodeCache({ stdTTL: 60 * 60 * 24 })
const routeTitleDB = new NodeCache({ stdTTL: 60 * 60 * 24 })
const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
})

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/")
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) // .pdf
    const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1e9)
    cb(null, uniqueName + ext)
  },
})

const upload = multer({ storage })

const app = express()

app.use(express.json())
app.use(cors())

app.get("/", (req, res) => {
  res.send("Hello World")
})

app.post("/chat/:chat_id", upload.single("file"), async (req, res) => {
  const {chat_id} = req.params
  console.log(req.file) // uploaded file
  const { userPrompt, userId , isHistory, currentChatId} = req.body

  if(userPrompt && currentChatId && typeof routeTitleDB.get(currentChatId) != "string") {
    console.log("Calling Title Assumer : ")
    const title = await promptTitleFinder(userPrompt)
    routeTitleDB.set(currentChatId, title)
  }
  if(currentChatId) {
    let routes = userChatRoutes.get(userId)
    if(!routes) {
      userChatRoutes.set(userId, [])
      routes = []
    }
    if(!routes.includes(currentChatId)) {
      userChatRoutes.set(userId, [...routes, currentChatId])
    }
  }
  const chat = db.get(chat_id) || []
  const userInput = {"message": userPrompt, "position": "right"}
  chat.push(userInput)
  let response = ""
  if (req.file) {
    // console.log("File uploaded: ", req.file.path)
    const filePath = path.join(process.cwd(), req.file.path)
    await indexTheDocument(filePath)
    const results = await vectorStore.similaritySearchWithScore(userPrompt)
    const texts = results.map(([document, score]) => document.pageContent)
    const result = await client.responses.create({
      model: "openai/gpt-oss-20b",
      temperature: 0.1,
      input: `Get answer to the question ${userPrompt} from the texts ${texts.join("\n\n")}. If you dont know the answer , simply tell - I dont know.`,
    })
    console.log(JSON.stringify(result, null, 2))
    // response = result.text
    response = result.output_text || "No response generated"
  }
  else {
    if(isHistory) {
      const arr = db.get(chat_id)
      return res.json({
        historyLinks: userChatRoutes.get(userId) || [],
        chatArr: arr || [{"message": "No data", "position": "no"}],
        routeTitleMap: cacheToJSON(routeTitleDB)
      })
    }
    else {
      const result = await generate(userPrompt, userId, chat_id)
      response = result
    }
  }

  //   console.log("Sending response: ", response)
  const responseObj = {"message": response, "position": "left"}
  db.set(chat_id, [...chat, responseObj])
  // chatHistory.set(userId, )

  res.json({
    message: response,
    historyLinks: userChatRoutes.get(userId),
    routeTitleMap: cacheToJSON(routeTitleDB)
  })
})

function cacheToJSON(cache) {
  const keys = cache.keys();          // string[]
  const obj = cache.mget(keys);       // { key1: value1, key2: value2, ... }
  return obj;
}


// app.post("/chat", async (req, res) => {
//   const { userPrompt, userId } = req.body

//   const result = await generate(userPrompt, userId)

//   res.json({
//     message: result,
//   })
// })

export default app

app.listen(3001, () => {
  console.log("Server is running on http://localhost:3001")
})
