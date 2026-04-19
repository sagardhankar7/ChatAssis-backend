import express from "express"
import { generate } from "./chatbot.js"
import cors from "cors"

const app = express()

app.use(express.json())
app.use(cors())

app.get("/", (req, res) => {
  res.send("Hello World")
})

app.post("/chat", async (req, res) => {
  const { userPrompt } = req.body

  const result = await generate(userPrompt)

  res.json({
    message: result,
  })
})

app.listen(3001, () => {
  console.log("Server is running on http://localhost:3001")
})
