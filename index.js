import express, { response } from "express"
import { generate } from "./chatbot.js"
import cors from "cors"
import multer from "multer"
import path from "path"
import { indexTheDocument, vectorStore } from "./PdfAi.js"
import OpenAI from "openai"
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

app.post("/chat", upload.single("file"), async (req, res) => {
  console.log(req.file) // uploaded file
  const { userPrompt, userId } = req.body
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
  } else {
    const result = await generate(userPrompt, userId)
    response = result
  }

  //   console.log("Sending response: ", response)
  res.json({
    message: response,
  })
})

// app.post("/chat", async (req, res) => {
//   const { userPrompt, userId } = req.body

//   const result = await generate(userPrompt, userId)

//   res.json({
//     message: result,
//   })
// })

app.listen(3001, () => {
  console.log("Server is running on http://localhost:3001")
})
