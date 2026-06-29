import { tavily } from '@tavily/core'
import { createAiGateway } from "ai-gateway-provider";
import { createUnified } from "ai-gateway-provider/providers/unified";
import { streamText,generateObject } from "ai";
import express from "express";
import { PROMPT_TEMPLATE ,SYSTEM_PROMPT } from './prompt';
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
        const result = streamText({
            model: aigateway(unified("workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast")),
            //schema: SearchResponseSchema,
            system:SYSTEM_PROMPT,
            prompt: prompt,
        });

       res.setHeader("Content-Type","text/plain");
       res.setHeader("Transfer-Encoding","chunked");
      
       for await(const textData of result.textStream){
            res.write(textData);
       }
       res.write("\n<SOURCES>\n");
       res.write(JSON.stringify(webSearchResult.map(result=>result.url)));
       res.write("\n</SOURCES>\n");
       res.end();
       
    }
         catch (error) {
    }
})


app.post("/ask/follow_ups",async (req,res)=>{
    //get the existing chat from db
    // -do context engineering 
    //forward the full history to the llm
    //stream the response to the user 
    //
})

app.listen(3000);
