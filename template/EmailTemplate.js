function emailTemplate(name, email, message) {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Email Template</title>
</head>
<body>
  <div class="main" style="background-color: #10151d; font-family: Arial, sans-serif; padding: 7rem 1rem; border-radius: 15px;">
    <h1 style="font-weight: 400; font-size: 2.125rem; line-height: 1.235; letter-spacing: 0.00735em; color: #bfc7d2; text-align: center; margin-bottom: 3rem;">Portfolio Mailing System</h1>
    <div class="container" style="background-color: #10151d; max-width: 30rem; min-height: 15rem; margin: 0 auto; border: 1px solid #2e3c51; border-radius: 15px; padding: 0.5rem;">
      <div class="info" style="margin: 0.5rem; border-bottom: 1px solid rgb(46, 60, 82, 0.5);">
        <p id="name" style="font-weight: 500; font-size: 1.25rem; line-height: 1.6; letter-spacing: 0.0075em; color: #bfc7d2; margin: 0.5rem 0;">${name}</p>
        <p id="email" style="font-size: 14px; font-family: Arial, sans-serif; max-width: 50rem; font-weight: 400; color: #808c9c; margin: 0.5rem 0;"><a href="mailto:${email}" style="color: #808c9c; text-decoration: none;">${email}</a></p>
      </div>
      <p id="message" style="color: #bfc7d2; margin: 0.5rem 0; margin-left: 0.5rem;">${message}</p>
    </div>
  </div>
</body>
</html>`;
}

module.exports = { emailTemplate };
