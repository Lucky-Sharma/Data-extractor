console.log("Hello via Bun!");
import express from "express";

const app = express();

app.post("/conversation", async (req, res) => {
    //
})

app.listen(3000);
