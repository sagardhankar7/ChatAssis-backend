import express, { response } from "express"
import { generate } from "./chatbot.js"
import cors from "cors"
import multer from "multer"
import fs from "fs"
import path from "path"
import {getVectorStore, indexTheDocument} from "./PdfAi.js"
import OpenAI from "openai"
import NodeCache from "node-cache";
import {promptTitleFinder} from "./promptTitleFinder.js";
const db = new NodeCache({ stdTTL: 60 * 60 * 24 }) // 24 HOUR TTL
const userChatRoutes = new NodeCache({ stdTTL: 60 * 60 * 24 })
const routeTitleDB = new NodeCache({ stdTTL: 60 * 60 * 24 })
const client = new OpenAI({
  apiKey: process.env["GROQ_API_KEY"],
  baseURL: "https://api.groq.com/openai/v1",
})
import os from "os"
import {v4 as uuid} from "uuid"

// const uploadDir = "uploads"
const uploadDir = path.join(os.tmpdir(), "uploads")

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir)
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) // .pdf
    const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1e9)
    cb(null, uniqueName + ext)
  },
})

const upload = multer({ storage })

const app = express()


// app.use(cors())
app.use(cors({
  origin: ['https://chat-assis-frontend.vercel.app', 'http://localhost:5173'],
  methods: ['GET', 'POST', 'OPTIONS'],
}));

app.use(express.json())

app.get("/", (req, res) => {
  res.send("Hello World")
})

app.post("/chat/:chat_id", upload.single("file"), async (req, res) => {

  try {

    const {chat_id} = req.params
    console.log(req.file) // uploaded file
    const { userId, currentChatId} = req.body
    const isHistory = req.body.isHistory === "true";

    let userPrompt = null
    if(req.body.userPrompt) {
      try {
        userPrompt = JSON.parse(req.body.userPrompt)
        console.log(userPrompt)
      } catch (e) {
        return res.status(400).json({ error: "Invalid userPrompt format" })
      }
    }
    // if(!userPrompt || !userPrompt.message) return res.json({message: "Message not received"})


    if (userPrompt?.message  && currentChatId && typeof routeTitleDB.get(currentChatId) != "string") {
      console.log("Calling Title Assumer : ")
      const title = await promptTitleFinder(userPrompt.message)
      routeTitleDB.set(currentChatId, title)
    }
    if (currentChatId) {
      let routes = userChatRoutes.get(userId)
      if (!routes) {
        userChatRoutes.set(userId, [])
        routes = []
      }
      if (!routes.includes(currentChatId)) {
        userChatRoutes.set(userId, [...routes, currentChatId])
      }
    }
    const chat = db.get(chat_id) || []
    // const userInput = {"message": userPrompt.message, "position": "right"}

    chat.push(userPrompt)
    let response = ""
    if (req.file) {
      // let defaultPrompt = "Give me the details"
      // if(userPrompt) {
      //   defaultPrompt = userPrompt
      // }
      console.log("File : ", req.file.path)
      const filePath =  req.file.path
      try {
        await indexTheDocument(filePath, userId, chat_id)
        const namespace = `user_${userId}`
        const vectorStore = getVectorStore(namespace);
        const results = await vectorStore.similaritySearchWithScore(userPrompt ? userPrompt.message : "give me general details", 4,
            {
              namespace: `user_${userId}`,
              chatId: String(chat_id)
            })
        const texts = results.map(([document, score]) => {
          console.log("score:", score, "text:", document.pageContent)
          return document.pageContent
        })
        const completion = await client.chat.completions.create({
          model: "openai/gpt-oss-20b",
          temperature: 0.1,
          messages: [
            {
              role: "system",
              content:
                  "Answer from the provided context."
            },
            {
              role: "user",
              content: `Context:\n${texts.join("\n\n")}\n\nQuestion: ${userPrompt?.message ? userPrompt.message : "give me general details"}`
            }
          ]
        })
        console.log(JSON.stringify(completion, null, 2))
        // response = result.text
        response = completion.choices[0].message.content;
        const responseId = uuid()
        const responseObj = {"message": response, "id": responseId, "position": "left"}
        db.set(chat_id, [...chat, responseObj])
      }finally {
        fs.unlink(filePath, (err) => {
          if (err) console.error("Failed to delete uploaded file:", filePath, err)
          else console.log("Deleted uploaded file:", filePath)
        })
      }
    } else {
      if (isHistory) {
        const arr = db.get(chat_id)
        return res.json({
          historyLinks: userChatRoutes.get(userId) || [],
          chatArr: arr || [{"message": "No data", "position": "no"}],
          routeTitleMap: cacheToJSON(routeTitleDB)
        })
      } else {
        const result = await generate(userPrompt.message, userId, chat_id)
        response = result
      }
    }

    //   console.log("Sending response: ", response)
    const responseId = uuid()
    const responseObj = {"message": response, "id": responseId, "position": "left"}
    db.set(chat_id, [...chat, responseObj])
    // chatHistory.set(userId, )

    res.json({
      message: response,
      id: responseId,
      historyLinks: userChatRoutes.get(userId ? userId : "1"),
      routeTitleMap: cacheToJSON(routeTitleDB)
    })
  }catch (error) {
    console.log("Error in the server,", error)
  }
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
