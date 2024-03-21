const express = require("express");
const app = express();
const cors = require("cors");
const dotenv = require("dotenv").config();
const { emailTemplate } = require("./template/EmailTemplate.js");

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const API_SECRET_KEY = process.env.API_SECRET_KEY;

app.use(express.json());
app.use(cors({ origin: ["https://sohamw.tech", "https://sohamw03.github.io"], methods: "GET, POST, PUT, DELETE, OPTIONS", allowedHeaders: "Content-Type, Authorization" }));

app.get("/", (req, res) => {
  res.send("Portfolio Mailing System is online 👍");
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
        from: "Portfolio Mailing System <pms@resend.dev>",
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
module.exports = app;
