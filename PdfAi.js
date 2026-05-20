import path from "path"
// Milestone: 1. Load the pdf document through langchain
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf"
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters"
import { OpenAIEmbeddings } from "@langchain/openai"
import { PineconeEmbeddings } from "@langchain/pinecone"
import { PineconeStore } from "@langchain/pinecone"
import { Pinecone as PineconeClient } from "@pinecone-database/pinecone"

import dotenv from "dotenv"
dotenv.config()

const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-small",
})
const pinecone = new PineconeClient({
  apiKey: process.env.PINECONE_API_KEY,
})
const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX_NAME)

export const vectorStore = new PineconeStore(embeddings, {
  pineconeIndex,
  maxConcurrency: 5, // 5 API calls to the vector store parallel (rate limit applied)
})
export async function indexTheDocument(filePath) {
  const loader = new PDFLoader(filePath, { splitPages: false })
  const doc = await loader.load()
  const loadedText = doc[0].pageContent
  // Milestone: Split the document into chunks
  const textsplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 100,
  })

  const textchunks = await textsplitter.splitText(loadedText)
  console.log("Chunk length =", textchunks.length)

  // Milestone: creating embedding for chunks
  //  Milestone: creating vector database to store vector embeddings

  // Store
  await vectorStore.addDocuments(
    textchunks.map((text) => ({ pageContent: text })),
  )
}
