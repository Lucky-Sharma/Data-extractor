import { type NextFunction, type Request, type Response } from "express";

import { createSupabaseClient } from "./clint";
import { da } from "zod/locales";

import { prisma } from "./db";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

const client = createSupabaseClient();

export default async function Middleware(req: Request, res: Response, next: NextFunction) {
    const token = req.headers.authorization;

    const data = await client.auth.getUser(token);
    const userId = data.data.user?.id;
    if (userId) {
        req.userId = userId;
        console.log(JSON.stringify(data));
        try {
            await prisma.user.create({
                data: {
                    id: data.data.user?.id,
                    superbaseId: data.data.user?.id || "",
                    email: data.data.user?.email!,
                    provider: data.data.user?.app_metadata.provider === "google" ? "google" : "github",
                    name: data.data.user?.user_metadata.full_name || ""
                }
            });
        }catch(e){
            console.log(e)
        }
       
        next();
    } else {
        res.status(403).json({
            message: "Incorrect inputes"
        })
    }


}