function emailTemplate(name, email, message) {
  return `<!DOCTYPE html>
<html>

<head>
  <title>Email Template</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: #10151d;
      font-family: "Google Sans Display", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
    }

    h1 {
      font-weight: 400;
      font-size: 2.125rem;
      line-height: 1.235;
      letter-spacing: 0.00735em;
      color: #bfc7d2;
      text-align: center;
      margin: 3rem 0;
    }

    .container {
      max-width: 30rem;
      min-height: 15rem;
      margin: 0 auto;
      border: 1px solid #2e3c51;
      border-radius: 15px;
      padding: 0.5rem;
    }

    .info {
      margin: 0.5rem;
      border-bottom: 1px solid rgb(46, 60, 82, 0.5);
    }

    .info p {
      color: #bfc7d2;
      margin: 0.5rem 0;
    }

    #name {
      font-weight: 500;
      font-size: 1.25rem;
      line-height: 1.6;
      letter-spacing: 0.0075em;
    }

    #email {
      font-size: 14px;
      font-family: "Google Sans Text", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
      max-width: 50rem;
      font-weight: 400;
      color: #808c9c;
    }

    #message {
      color: #bfc7d2;
      margin: 0.5rem 0;
      margin-left: 0.5rem;
    }

    a {
      color: #808c9c;
      text-decoration: none;
    }
  </style>
</head>

<body>
  <h1>Portfolio Mailing System</h1>
  <div class="container">
    <div class="info">
      <p id="name">${name}</p>
      <p id="email"><a href="mailto:${email}">${email}</a></p>
    </div>
    <p id="message">${message}</p>
  </div>
</body>

</html>`;
}

module.exports = { emailTemplate };
