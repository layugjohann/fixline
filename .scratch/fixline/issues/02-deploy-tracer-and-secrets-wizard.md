# 02: Deploy the tracer + secrets wizard

**What to build:** The tracer page is live at a public Vercel URL. A generated interactive setup wizard walks the human through provisioning the secrets: the Groq and Gemini keys, linking the Vercel project, and setting the GitHub repository secrets. That way the procedure is repeatable rather than tribal knowledge.

**Human step:** the author runs the wizard and approves the deployment.

**Blocked by:** 01

**Status:** awaiting-merge
Pull Request: https://github.com/layugjohann/fixline/pull/2

- [x] A setup wizard script exists, and running it writes the local env file and sets the GitHub secrets
- [x] The env file is git-ignored, and no secret is committed
- [x] The tracer page is reachable at a public URL and processes the hard-coded Message using the deployed Groq key
- [x] The README links to the live URL

## Comments

- 2026-11-15: Added `scripts/setup.sh` (wizard). The author ran it: `.env.local` written; GitHub secrets `GROQ_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY` set; Vercel project `fixline` linked with both keys in Production; deployed. The public URL is https://fixline-phi.vercel.app because `fixline.vercel.app` belongs to an unrelated project. A live `POST /api/intake` with the tracer Message returned 200 and one Work Order. The team-slug alias is behind Vercel Authentication and isn't public.
