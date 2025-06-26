import "dotenv/config";
import { MongoClient } from "mongodb";
import { chromium } from "playwright";
import ImageKit from "imagekit";

const SITE_URL = "https://brutalist.report/topic/tech?limit=100";

// MongoDB Configuration - ensure these are in your .env file
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/";
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || "brutalist_report";
const MONGODB_COLLECTION_NAME = process.env.MONGODB_COLLECTION_NAME || "articles";

// ImageKit Configuration - ensure these are in your .env file
const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});

const IMAGEKIT_TAG = "hnrss";
const ENABLE_VERBOSE_LOGGING = false; // Set to false to reduce logging
let mongoClient;

// Custom logging function
function log(message, force = false) {
  if (ENABLE_VERBOSE_LOGGING || force) {
    console.log(message);
  }
}

// Helper function to delete old images with HNRSS tag from ImageKit
async function deleteOldImagesFromImageKit() {
  try {
    log("[ImageKit] Fetching existing images with tag: " + IMAGEKIT_TAG);

    // Get all images with the HNRSS tag
    const listFiles = await imagekit.listFiles({
      tags: IMAGEKIT_TAG,
      limit: 1000 // Adjust as needed
    });

    if (listFiles.length === 0) {
      log("[ImageKit] No existing images found with tag: " + IMAGEKIT_TAG);
      return;
    }

    log(`[ImageKit] Found ${listFiles.length} existing images to delete`);

    // Delete images in batches to avoid rate limits
    const deletePromises = listFiles.map(async (file) => {
      try {
        await imagekit.deleteFile(file.fileId);
        log(`[ImageKit] Deleted: ${file.name}`);
      } catch (deleteError) {
        console.error(`[ImageKit] Failed to delete ${file.name}:`, deleteError.message);
      }
    });

    await Promise.all(deletePromises);
    log("[ImageKit] Finished deleting old images");
  } catch (error) {
    console.error("[ImageKit] Error deleting old images:", error.message);
    throw error;
  }
}

// Helper function to upload screenshot to ImageKit
async function uploadScreenshotToImageKit(screenshotBuffer, filename, articleTitle) {
  try {
    const uploadResponse = await imagekit.upload({
      file: screenshotBuffer,
      fileName: filename,
      tags: [IMAGEKIT_TAG],
      folder: "/hnrss-screenshots/",
      isPrivateFile: false,
      useUniqueFileName: true
    });

    log(`[ImageKit] Uploaded: ${filename} -> ${uploadResponse.url}`);
    return uploadResponse.url;
  } catch (error) {
    console.error(`[ImageKit] Upload failed for ${filename}:`, error.message);
    throw error;
  }
}

async function scrapeBrutalistReport() {
  console.log("Starting scrape...", true);

  mongoClient = new MongoClient(MONGODB_URI);

  try {
    // Delete old images from ImageKit before starting
    await deleteOldImagesFromImageKit();

    await mongoClient.connect();
    log("[MongoDB] Connected successfully to server");
    const db = mongoClient.db(MONGODB_DB_NAME);
    const collection = db.collection(MONGODB_COLLECTION_NAME);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      javaScriptEnabled: true,
      acceptDownloads: false,
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    log(`Navigating to ${SITE_URL}`);
    await page.goto(SITE_URL, { waitUntil: "networkidle", timeout: 60000 });
    log("Page loaded. Waiting for articles...");

    await page.waitForSelector("div.brutal-grid > div > ul", { timeout: 30000 });
    log("Article container found.");

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

    log(`Found articles from ${Object.keys(articlesBySource).length} sources.`);

    log("Preparing articles from all sources...");

    const allArticles = [];
    // Iterate over all sources and their articles
    for (const sourceName in articlesBySource) {
      if (articlesBySource.hasOwnProperty(sourceName)) {
        articlesBySource[sourceName].forEach((article) => {
          // Add all articles, initialize screenshotUrl to null
          allArticles.push({ ...article, sourceName: sourceName, screenshotUrl: null });
        });
        log(`Added ${articlesBySource[sourceName].length} articles from '${sourceName}'.`);
      }
    }

    if (allArticles.length > 0) {
      log(`Total articles to process: ${allArticles.length}.`);
    } else {
      log("No articles found from any source to process.");
    }

    const BATCH_SIZE = 10;
    for (let i = 0; i < allArticles.length; i += BATCH_SIZE) {
      const batch = allArticles.slice(i, i + BATCH_SIZE);
      log(`[Batch Processing] Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(allArticles.length / BATCH_SIZE)} (Articles ${i + 1} to ${Math.min(i + BATCH_SIZE, allArticles.length)})`);

      const batchPromises = batch.map(async (article, indexInBatch) => {
        const overallIndex = i + indexInBatch;
        let newPage;
        try {
          // Only take screenshots for 'Hacker News' articles
          if (article.sourceName === "Hacker News") {
            newPage = await context.newPage();
            await newPage.setViewportSize({ width: 800, height: 600 });

            log(`[Screenshot] Navigating to (Hacker News): ${article.link.substring(0, 70)}... (Article ${overallIndex + 1}/${allArticles.length})`);
            try {
              await newPage.goto(article.link, { waitUntil: "networkidle", timeout: 10000 });
            } catch (navError) {
              log(`[Screenshot] Navigation timeout/error for ${article.link.substring(0, 70)}... (Article ${overallIndex + 1}/${allArticles.length}): ${navError.message.split("\n")[0]}. Proceeding with screenshot.`);
            }

            const safeTitle = article.title.replace(/[^a-z0-9\-_]/gi, "_").substring(0, 100);
            const filename = `${safeTitle}_${overallIndex}.jpg`; // Filename for logging

            const screenshotBuffer = await newPage.screenshot({
              type: "jpeg",
              quality: 70,
              fullPage: false,
            });
            log(`[Screenshot] Captured: ${filename} (Article ${overallIndex + 1}/${allArticles.length})`);

            // Upload screenshot to ImageKit and get public URL
            try {
              article.screenshotUrl = await uploadScreenshotToImageKit(screenshotBuffer, filename, article.title);
              log(`[ImageKit] Successfully uploaded and stored URL for: ${filename} (Article ${overallIndex + 1}/${allArticles.length})`);
            } catch (uploadError) {
              console.error(`[ImageKit] Failed to upload ${filename}: ${uploadError.message}`);
              article.screenshotUrl = null;
            }
          } else {
            // For non-Hacker News articles, log that screenshot is skipped
            log(`[Data] Skipping screenshot for non-Hacker News article: ${article.title.substring(0, 50)}... (Source: ${article.sourceName}, Article ${overallIndex + 1}/${allArticles.length})`);
          }
        } catch (err) {
          console.error(`[Processing] General error for ${article.link.substring(0, 70)}... (Article ${overallIndex + 1}/${allArticles.length}): ${err.message.split("\n")[0]}`);
          // Ensure screenshotUrl remains null if an error occurs during processing
          article.screenshotUrl = null;
        } finally {
          if (newPage) {
            await newPage.close();
          }
        }
      });
      await Promise.all(batchPromises);
      log(`[Batch Processing] Finished batch ${Math.floor(i / BATCH_SIZE) + 1}.`);
    }

    log("Article processing (including selective screenshots) finished.");

    // Empty the MongoDB collection before inserting new articles to ensure the DB is not empty during screenshot capture
    log(`[MongoDB] Clearing old articles from ${MONGODB_COLLECTION_NAME} before inserting new batch...`);
    await collection.deleteMany({});
    log("[MongoDB] Old articles cleared for fresh insertion.");

    if (allArticles.length > 0) {
      const articlesToInsert = allArticles.map((art) => ({
        title: art.title,
        link: art.link,
        sourceName: art.sourceName,
        screenshotUrl: art.screenshotUrl,
        scrapedAt: new Date(),
      }));
      log(`[MongoDB] Inserting ${articlesToInsert.length} articles into ${MONGODB_COLLECTION_NAME}...`);
      await collection.insertMany(articlesToInsert);
      log(`[MongoDB] Successfully inserted ${articlesToInsert.length} articles.`);
    } else {
      log("[MongoDB] No articles to insert.");
    }

    await browser.close();
    log("Browser closed.");
  } catch (error) {
    console.error("Error during scraping process:", error);
  } finally {
    if (mongoClient) {
      await mongoClient.close();
      log("[MongoDB] Connection closed.");
    }
  }
}

scrapeBrutalistReport();
