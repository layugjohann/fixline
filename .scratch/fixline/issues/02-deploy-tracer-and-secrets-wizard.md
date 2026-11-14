# 02: Deploy the tracer + secrets wizard

**What to build:** The tracer page is live at a public Vercel URL. A generated interactive setup wizard walks the human through provisioning the secrets: the Groq and Gemini keys, linking the Vercel project, and setting the GitHub repository secrets. That way the procedure is repeatable rather than tribal knowledge.

**Human step:** the author runs the wizard and approves the deployment.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] A setup wizard script exists, and running it writes the local env file and sets the GitHub secrets
- [ ] The env file is git-ignored, and no secret is committed
- [ ] The tracer page is reachable at a public URL and processes the hard-coded Message using the deployed Groq key
- [ ] The README links to the live URL
