import { tavily } from '@tavily/core'
import { createAiGateway } from "ai-gateway-provider";
import { createUnified } from "ai-gateway-provider/providers/unified";
import { streamText } from "ai";
import express from "express";
import { PROMPT_TEMPLATE, SYSTEM_PROMPT } from './prompt';
import { prisma } from './db';
import Middleware from './middleware';
import cors from "cors";
import { randomUUID } from "crypto";
import { MessageRole } from './prisma/generated/enums';

const client = tavily({ apiKey: process.env.TAVILY_API_KEY });
const app = express();

app.use(express.json());
app.use(cors({
    exposedHeaders: ['X-Conversation-Id'],
}));


const aigateway = createAiGateway({
    accountId: "b4e5ce498746a4587131d73bb0ba2251",
    gateway: "default",
    apiKey: process.env.CF_AIG_TOKEN,
});
const unified = createUnified();
const model = aigateway(unified("workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast"));

function slugify(text: string, maxLen = 80): string {
    return text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/[\s]+/g, "-")
        .replace(/-{2,}/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, maxLen);
}

app.get("/conversations", Middleware, async (req, res) => {
    try {
        const conversations = await prisma.conversation.findMany({
            where: { userId: req.userId! },
            select: { id: true, title: true, slug: true },
            orderBy: { id: "desc" },
        });
        res.json({ conversations });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to fetch conversations" });
    }
});

app.get("/conversation/:conversationId", Middleware, async (req, res) => {
    try {
        const conversation = await prisma.conversation.findFirst({
            where: {
                id: req.params.conversationId,
                userId: req.userId!,
            },
            include: {
                Message: {
                    orderBy: { createdAt: "asc" },
                },
            },
        });

        if (!conversation) {
            res.status(404).json({ message: "Conversation not found" });
            return;
        }

        res.json({ conversation });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to fetch conversation" });
    }
});


app.post("/ask", Middleware, async (req, res) => {
    const { conversationId } = req.body;
    const query = req.body.query?.trim().slice(0, 500);

    if (!query) {
        res.status(400).json({ message: "query is required" });
        return;
    }

    try {
        const webSearch = await client.search(query, { searchDepth: "advanced" });
        const webSearchResult = webSearch.results;

        const convId = conversationId ?? randomUUID();
        const slug = slugify(query);

        await prisma.conversation.upsert({
            where: { id: convId },
            create: {
                id: convId,
                title: query.slice(0, 100),
                slug,
                userId: req.userId!,
            },
            update: {},
        });

        await prisma.message.create({
            data: {
                id: randomUUID(),
                content: query,
                role: MessageRole.User,
                ConversationId: convId,
            },
        });

        const prompt = PROMPT_TEMPLATE
            .replace("{{WEB_SEARCH_RESULTS}}", JSON.stringify(webSearchResult))
            .replace("{{USER_QUERY}}", query);

        const result = streamText({
            model,
            system: SYSTEM_PROMPT,
            prompt,
        });

        res.setHeader("Content-Type", "text/plain");
        res.setHeader("Transfer-Encoding", "chunked");
        res.setHeader("X-Conversation-Id", convId);

        let fullResponse = "";

        for await (const chunk of result.textStream) {
            res.write(chunk);
            fullResponse += chunk;
        }

        res.write("\n<SOURCES>\n");
        res.write(JSON.stringify(webSearchResult.map(r => r.url)));
        res.write("\n</SOURCES>\n");
        res.end();

        await prisma.message.create({
            data: {
                id: randomUUID(),
                content: fullResponse,
                role: MessageRole.Assistant,
                ConversationId: convId,
            },
        });

    } catch (error) {
        console.error(error);
        if (!res.headersSent) {
            res.status(500).json({ message: "Something went wrong" });
        } else {
            res.end();
        }
    }
});

app.post("/ask/follow_ups", Middleware, async (req, res) => {
    const { conversationId } = req.body;
    const query = req.body.query?.trim().slice(0, 500);

    if (!conversationId || !query) {
        res.status(400).json({ message: "conversationId and query are required" });
        return;
    }

    try {
        const conversation = await prisma.conversation.findFirst({
            where: { id: conversationId, userId: req.userId! },
            include: {
                Message: { orderBy: { createdAt: "asc" } },
            },
        });

        if (!conversation) {
            res.status(404).json({ message: "Conversation not found" });
            return;
        }

        await prisma.message.create({
            data: {
                id: randomUUID(),
                content: query,
                role: MessageRole.User,
                ConversationId: conversationId,
            },
        });

        const messages: { role: "user" | "assistant"; content: string }[] =
            conversation.Message.map(m => ({
                role: m.role === "User" ? "user" : "assistant",
                content: m.content,
            }));

        messages.push({ role: "user", content: query });

        const result = streamText({
            model,
            system: SYSTEM_PROMPT,
            messages,
        });

        res.setHeader("Content-Type", "text/plain");
        res.setHeader("Transfer-Encoding", "chunked");

        let fullResponse = "";

        for await (const chunk of result.textStream) {
            res.write(chunk);
            fullResponse += chunk;
        }

        res.end();

        await prisma.message.create({
            data: {
                id: randomUUID(),
                content: fullResponse,
                role: MessageRole.Assistant,
                ConversationId: conversationId,
            },
        });

    } catch (error) {
        console.error(error);
        if (!res.headersSent) {
            res.status(500).json({ message: "Something went wrong" });
        } else {
            res.end();
        }
    }
});

app.delete("/conversation/:id", Middleware, async (req, res) => {
    const { id } = req.params;
    try {
        const conversation = await prisma.conversation.findFirst({
            where: { id, userId: req.userId! },
        });

        if (!conversation) {
            res.status(404).json({ message: "Conversation not found" });
            return;
        }

        await prisma.message.deleteMany({
            where: { ConversationId: id },
        });

        await prisma.conversation.delete({
            where: { id },
        });

        res.json({ message: "Deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
});

app.listen(3001, () => console.log("🚀 Server running on http://localhost:3001"));


