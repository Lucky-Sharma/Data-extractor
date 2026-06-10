import { tavily } from '@tavily/core'
import { createAiGateway } from "ai-gateway-provider";
import { createUnified } from "ai-gateway-provider/providers/unified";
import { streamText } from "ai";
import express from "express";
import { PROMPT_TEMPLATE } from './prompt';
import { z } from "zod";

const client = tavily({ apiKey: process.env.TAVILY_API_KEY });
const app = express();

app.use(express.json());

const SearchResponseSchema = z.object({
    answer: z.string(),
    summary: z.string(),
    keyPoints: z.array(z.string()),
})

app.post("/ask", async (req, res) => {
    //get the query from the user 
    const query = req.body.query;


    //check the user have enough credit 
    //check if we have web search indexed for similar query  
    //web search to gether sources

    const webSearch = await client.search(query, {
        searchDepth: "advanced"
    })
    const webSearchResult = webSearch.results;

    //hit the llm and stram back the response 
    const aigateway = createAiGateway({
        accountId: "b4e5ce498746a4587131d73bb0ba2251",
        gateway: "default",
        apiKey: process.env.CF_AIG_TOKEN,
    });

    const unified = createUnified();

    const prompt = PROMPT_TEMPLATE
        .replace("{{WEB_SEARCH_RESULTS}}", JSON.stringify(webSearchResult))
        .replace("{{USER_QUERY}}", query)

    try {
        const result =  await streamText({
            model: aigateway(unified("workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast")),
            // schema: SearchResponseSchema,
            prompt: prompt,
        });

       res.setHeader("Content-Type","text/plane");
       res.setHeader("Transfer-Encoding","chunked");
      
       for await(const textData of result.textStream){
            res.write(textData);
       }
       res.write("------sources---------\n");

       webSearchResult.forEach(result=>res.write(JSON.stringify(result)));
       res.end();

    } catch (error) {
    }
})

app.listen(3000);
