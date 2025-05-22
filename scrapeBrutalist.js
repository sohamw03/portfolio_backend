import "dotenv/config";
import { MongoClient } from "mongodb";
import { chromium } from "playwright";

const SITE_URL = "https://brutalist.report/topic/tech?limit=100";

// MongoDB Configuration - ensure these are in your .env file
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/";
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || "brutalist_report";
const MONGODB_COLLECTION_NAME = process.env.MONGODB_COLLECTION_NAME || "articles";
let mongoClient;

async function scrapeBrutalistReport() {
  console.log("Starting scrape...");

  mongoClient = new MongoClient(MONGODB_URI);

  try {
    await mongoClient.connect();
    console.log("[MongoDB] Connected successfully to server");
    const db = mongoClient.db(MONGODB_DB_NAME);
    const collection = db.collection(MONGODB_COLLECTION_NAME);

    console.log(`[MongoDB] Clearing old articles from ${MONGODB_COLLECTION_NAME}...`);
    await collection.deleteMany({});
    console.log("[MongoDB] Old articles cleared.");

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      javaScriptEnabled: true,
      acceptDownloads: false,
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    console.log(`Navigating to ${SITE_URL}`);
    await page.goto(SITE_URL, { waitUntil: "networkidle", timeout: 60000 });
    console.log("Page loaded. Waiting for articles...");

    await page.waitForSelector("div.brutal-grid > div > ul", { timeout: 30000 });
    console.log("Article container found.");

    const articlesBySource = await page.evaluate(() => {
      const sources = {};
      document.querySelectorAll("body > div.brutal-grid > div > h3").forEach((sourceHeadingEl) => {
        const sourceName = sourceHeadingEl.querySelector("a") ? sourceHeadingEl.querySelector("a").innerText.trim() : "Unknown Source";
        sources[sourceName] = [];
        let currentElement = sourceHeadingEl.nextElementSibling;
        if (currentElement && currentElement.tagName === "UL") {
          currentElement.querySelectorAll("li").forEach((articleEl) => {
            const titleElement = articleEl.querySelector("a");
            const rawLink = titleElement ? titleElement.href : null;
            const title = titleElement ? titleElement.innerText.trim().split("\n")[0] : "No title";
            if (rawLink && title !== "No title") {
              const link = new URL(rawLink, document.baseURI).href;
              sources[sourceName].push({ title, link });
            }
          });
        }
      });
      return sources;
    });

    console.log(`Found articles from ${Object.keys(articlesBySource).length} sources.`);

    console.log("Preparing articles from all sources...");

    const allArticles = [];
    // Iterate over all sources and their articles
    for (const sourceName in articlesBySource) {
      if (articlesBySource.hasOwnProperty(sourceName)) {
        articlesBySource[sourceName].forEach((article) => {
          // Add all articles, initialize screenshotBase64 to null
          allArticles.push({ ...article, sourceName: sourceName, screenshotBase64: null });
        });
        console.log(`Added ${articlesBySource[sourceName].length} articles from '${sourceName}'.`);
      }
    }

    if (allArticles.length > 0) {
      console.log(`Total articles to process: ${allArticles.length}.`);
    } else {
      console.log("No articles found from any source to process.");
    }

    const BATCH_SIZE = 10;
    for (let i = 0; i < allArticles.length; i += BATCH_SIZE) {
      const batch = allArticles.slice(i, i + BATCH_SIZE);
      console.log(`[Batch Processing] Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(allArticles.length / BATCH_SIZE)} (Articles ${i + 1} to ${Math.min(i + BATCH_SIZE, allArticles.length)})`);

      const batchPromises = batch.map(async (article, indexInBatch) => {
        const overallIndex = i + indexInBatch;
        let newPage;
        try {
          // Only take screenshots for 'Hacker News' articles
          if (article.sourceName === "Hacker News") {
            newPage = await context.newPage();
            await newPage.setViewportSize({ width: 800, height: 600 });

            console.log(`[Screenshot] Navigating to (Hacker News): ${article.link.substring(0, 70)}... (Article ${overallIndex + 1}/${allArticles.length})`);
            try {
              await newPage.goto(article.link, { waitUntil: "networkidle", timeout: 10000 });
            } catch (navError) {
              console.warn(`[Screenshot] Navigation timeout/error for ${article.link.substring(0, 70)}... (Article ${overallIndex + 1}/${allArticles.length}): ${navError.message.split("\n")[0]}. Proceeding with screenshot.`);
            }

            const safeTitle = article.title.replace(/[^a-z0-9\-_]/gi, "_").substring(0, 100);
            const filename = `${safeTitle}_${overallIndex}.jpg`; // Filename for logging

            const screenshotBuffer = await newPage.screenshot({
              type: "jpeg",
              quality: 70,
              fullPage: false,
            });
            console.log(`[Screenshot] Captured: ${filename} (Article ${overallIndex + 1}/${allArticles.length})`);

            article.screenshotBase64 = screenshotBuffer.toString("base64");
            console.log(`[Data] Converted screenshot to Base64 for: ${filename} (Article ${overallIndex + 1}/${allArticles.length})`);
          } else {
            // For non-Hacker News articles, log that screenshot is skipped
            console.log(`[Data] Skipping screenshot for non-Hacker News article: ${article.title.substring(0, 50)}... (Source: ${article.sourceName}, Article ${overallIndex + 1}/${allArticles.length})`);
          }
        } catch (err) {
          console.error(`[Processing] General error for ${article.link.substring(0, 70)}... (Article ${overallIndex + 1}/${allArticles.length}): ${err.message.split("\n")[0]}`);
          // Ensure screenshotBase64 remains null if an error occurs during screenshotting attempt
          article.screenshotBase64 = null;
        } finally {
          if (newPage) {
            await newPage.close();
          }
        }
      });
      await Promise.all(batchPromises);
      console.log(`[Batch Processing] Finished batch ${Math.floor(i / BATCH_SIZE) + 1}.`);
    }

    console.log("Article processing (including selective screenshots) finished.");

    if (allArticles.length > 0) {
      const articlesToInsert = allArticles.map((art) => ({
        title: art.title,
        link: art.link,
        sourceName: art.sourceName,
        screenshotBase64: art.screenshotBase64,
        scrapedAt: new Date(),
      }));
      console.log(`[MongoDB] Inserting ${articlesToInsert.length} articles into ${MONGODB_COLLECTION_NAME}...`);
      await collection.insertMany(articlesToInsert);
      console.log(`[MongoDB] Successfully inserted ${articlesToInsert.length} articles.`);
    } else {
      console.log("[MongoDB] No articles to insert.");
    }

    await browser.close();
    console.log("Browser closed.");
  } catch (error) {
    console.error("Error during scraping process:", error);
  } finally {
    if (mongoClient) {
      await mongoClient.close();
      console.log("[MongoDB] Connection closed.");
    }
  }
}

scrapeBrutalistReport();
