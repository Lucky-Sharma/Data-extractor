import { tavily } from '@tavily/core'
import express from "express";

const client = tavily({ apiKey: process.env.TAVILY_API_KEY });
const app = express();

app.use(express.json());

app.post("/ask", async (req, res) => {
    //get the query from the user 
    const prompt = req.body.query;


    //check the user have enough credit 
    //check if we have web search indexed for similar query  
    //web search to gether sources

    const webSearch = await client.search(prompt, {
        searchDepth: "advanced"
    })
    const webSearchResult = webSearch.results;
    //hit the llm and stram back the response 


})

app.listen(3000);
