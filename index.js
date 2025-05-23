import cors from "cors";
import "dotenv/config";
import express, { json } from "express";
import fs from "fs/promises"; // Added fs/promises import
import { MongoClient } from "mongodb"; // Added MongoDB import
import { emailTemplate } from "./template/EmailTemplate.js";
const app = express();

const CACHE_FILE_PATH = "./articles_cache.json"; // Defined cache file path

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const API_SECRET_KEY = process.env.API_SECRET_KEY;

// MongoDB Configuration
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/";
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || "brutalist_report";
const MONGODB_COLLECTION_NAME = process.env.MONGODB_COLLECTION_NAME || "articles";

app.use(json());
app.use(cors({ origin: ["https://sohamw.vercel.app", "https://sohamw03.github.io"], methods: "GET, POST", allowedHeaders: "Content-Type, Authorization" }));

app.get("/", (req, res) => {
  res.send("Portfolio Backend is online 👍");
});

// New route to get Hacker News articles - Modified to use MongoDB
app.get("/api/hn-articles", async (req, res) => {
  let mongoClient;
  try {
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    const db = mongoClient.db(MONGODB_DB_NAME);
    const collection = db.collection(MONGODB_COLLECTION_NAME);

    // Fetch all articles, sorted by scrapedAt descending if needed, or by sourceName
    const articlesFromDB = await collection.find({}).sort({ _id: 1 }).toArray();

    if (articlesFromDB && articlesFromDB.length > 0) {
      // Group articles by sourceName for the frontend
      const articlesBySource = articlesFromDB.reduce((acc, article) => {
        const { sourceName, ...rest } = article;
        if (!acc[sourceName]) {
          acc[sourceName] = [];
        }
        acc[sourceName].push(rest);
        return acc;
      }, {});

      // Save to cache
      fs.writeFile(CACHE_FILE_PATH, JSON.stringify(articlesBySource))
        .then(() => console.log("Articles cached successfully."))
        .catch(cacheWriteErr => console.error("Cache write error:", cacheWriteErr)); // Log cache write error but don't block response

      return res.json(articlesBySource); // Respond with DB data even if cache write fails
    } else {
      // Handle empty articlesFromDB by attempting to read from cache
      console.log("No articles fetched from MongoDB, attempting to read from cache.");
      throw new Error("No articles from DB"); // Trigger catch block for cache fallback
    }
  } catch (dbOrLogicErr) { // Renamed to clarify this catches DB errors or the "No articles from DB" error
    console.error("MongoDB fetch error or initial logic failure:", dbOrLogicErr.message);
    try {
      console.log("Attempting to serve articles from cache due to previous error.");
      const cachedData = await fs.readFile(CACHE_FILE_PATH, 'utf-8');
      try {
        const cachedArticles = JSON.parse(cachedData);
        console.log("Serving articles from cache.");
        return res.json(cachedArticles);
      } catch (parseErr) {
        console.error("Cache parse error:", parseErr);
        return res.status(500).json({ error: "Could not load articles from database or cache." });
      }
    } catch (cacheReadErr) {
      console.error("Cache read error:", cacheReadErr);
      return res.status(500).json({ error: "Could not load articles from database or cache." });
    }
  } finally {
    if (mongoClient) {
      await mongoClient.close();
    }
  }
});

app.post("/api/mail", async (req, res) => {
  const { name, email, message, api_secret_key } = req.body;
  console.log(name, email, message, RESEND_API_KEY);
  if (api_secret_key !== API_SECRET_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Portfolio Mailing System <soham@resend.dev>",
        to: ["waghmare.22111255@viit.ac.in"],
        subject: `${name} sent you a message!`,
        html: emailTemplate(name, email, message),
      }),
    });
    const responseJson = await response.json();

    if (response.ok && response.status === 200) {
      return res.status(200).json({ responseJson, payload: { name: name, email: email, message: message } });
    } else {
      return res.status(response.status).json({ error: "Resend error" });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});

// Export the Express API
export default app;
