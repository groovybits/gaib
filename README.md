# Groovy AI Bot (GAIB)

**Project by Chris Kennedy**

GAIB, the Groovy AI Bot, is a chatbot that can understand, speak, and translate any language in both text and audio formats. It can also take on various AI bot modes or personalities, each designed for specific tasks. Furthermore, GAIB has an Anime generation theme that creates stories based on the data from PDFs stored in the vector database.
<https://ai.groovy.org> Try it out.

## Features

- Speaking, multilingual, differntian of male/female speakers + different actors voices.
- Listening via button for speaking into GAIB for voice command control.
- Chat context and episodic story context to create story arcs.
- Configurable personalities for many modes.
- Story or question mode for each personality.
- Subtitles multilingual, Anime quality.
- Meme images per subtitle line for visual story telling via memes.
- Control of number of maxTokens, Documents used, Number of episodes created on topic.
- Transcript view to copy/paste in markup output.
- Anime view mode or basic Terminal output mode.
- Full screen view to display only the images and subtitles or terminal output on TVs etc casting.
- Login per user, token tracking via firebase.
- Stripe payments for premium users with token allocation per month, configure free user tokens.

## AI Bot Modes

0. **Anime**: Create Anime like stories based on the given context and story direction.
1. **Stories**: Create a short story based on the given context and story direction, using characters from the context.
2. **Video Engineer**: Answer questions about video and audio media handling, using the context to solve problems.
3. **Therapist**: Provide advice on mindfulness and meditation techniques based on the context and question.
4. **Poet**: Create poems inspired by the context and suggested characters.
5. **Engineer**: Design software architecture based on the context and direction given.
6. **Coder**: Create software based on the context and coding task.
7. **Interviewer**: Conduct a software engineer job interview, focusing on video-related questions.
8. **Hebrew**: Answer questions or tell stories using references from Hebrew scriptures.
9. **Christian**: Answer questions or tell stories using references from the Bible.
10. **Muslim**: Answer questions or tell stories using references from the Quran.
11. **Buddhist**: Answer questions or tell stories using references from the Kanjur and Tanjur Buddhist texts.
12. **Cactus**: Answer questions or tell stories using references from the San Pedro Sacred Cactus texts.
13. **Vedic**: Answer questions or tell stories using references from the Vedas and Hindu scriptures.
14. **BookOfMormon**: Answer questions or tell stories using references from the Book of Mormon and Bible.

The goal of GAIB is to ingest and create personalities for a universal, wise AI Bot that is groovy.

### Text to Speech

To set up Google Cloud authentication for the Text-to-Speech API:

- Get a GCP Google Cloud account: [Getting Started](https://cloud.google.com/docs/authentication/getting-started)
- Create a new project in the Google Cloud Console.
- Enable the Google Text-to-Speech API for your project.
- Create a service account in your project and download the service account key as a JSON file.
- Set the `GOOGLE_APPLICATION_CREDENTIALS` `.env` environment variable to the path of your downloaded JSON file.
- Enable Google Text Translation API for your project.
- Get the Google Text Translation API Key and add it into `.env` (see `.env.example`).
- Get a pexels.com API key and put it in `.env` (Pexels is free). <https://www.pexels.com/api/>
- Set up a Firebase DB and Stripe payments: [Setup Guide](https://blog.jarrodwatts.com/set-up-subscription-payments-with-stripe-using-firebase-and-nextjs)

The tech stack used includes LangChain, Pinecone, TypeScript, OpenAI, and Next.js. LangChain is a framework that makes it easier to build scalable AI/LLM apps and chatbots. Pinecone is a vector store for storing embeddings and your PDF in text to later retrieve similar docs.

**If you run into errors, please review the troubleshooting section further down this page.**

## Development

1. Clone the repo

```
git clone [github https url]
```

2. Install packages

```
pnpm install
```

3. Set up your `.env` file

- Copy `.env.example` into `.env`
  Your `.env` file should look like this: <https://github.com/groovybits/gaib/blob/main/.env.example>

- Visit [OpenAI](https://help.openai.com/en/articles/4936850-where-do-i-find-my-secret-api-key) to retrieve API
keys and insert them into your `.env` file.
- Visit [Pinecone](https://pinecone.io/) to create and retrieve your API keys, and also retrieve your environment and index name from the dashboard.

4. Set up the `PINECONE_NAME_SPACE` in `.env` with a `namespace` where you'd like to store your embeddings on Pinecone when you run `pnpm run ingest`. This namespace will later be used for queries and retrieval. The different personalities check if the namespace exists for their names too, so they can focus on a set of data.

5. In `utils/makechain.ts`, you'll find the main OpenAI SDK code. Change `modelName` in `new OpenAIChat` to `gpt-3.5-turbo` if you don't have access to `gpt-4`. Please verify outside this repo that you have access to `gpt-4`, otherwise the application will not work with it. There are personalities setup in <https://github.com/groovybits/gaib/blob/main/config/personalityPrompts.ts>

## Convert your PDF files to embeddings

**This repo can load multiple PDF files**

1. Inside the `docs` folder, add your PDF files or folders containing PDF files.

2. Run the script `npm run ingest <namespace>` to 'ingest' and embed your docs. If you run into errors, troubleshoot below.

3. Check the Pinecone dashboard to verify your namespace and vectors have been added.

## Run the app

Once you've verified that the embeddings and content have been successfully added to your Pinecone, you can run the app `pnpm run dev` to launch the local dev environment, and then type a question in the chat interface.

## Troubleshooting

This project is moving fast and furious. If you have any questions, please ask me by filing a ticket on GitHub, and I will help. Contributions are even better!

**General errors**

- Make sure you're running the latest Node version. Run `node -v`.
- Try a different PDF or convert your PDF to text first. It's possible your PDF is corrupted, scanned, or requires OCR to convert to text.
- `Console.log` the `env` variables and make sure they are exposed.
- Make sure you're using the same versions of LangChain and Pinecone as this repo.
- Check that you've created an `.env` file that contains your valid (and working) API keys, environment, and index name.
- If you change `modelName` in `OpenAIChat`, note that the correct name of the alternative model is `gpt-3.5-turbo`.
- Make sure you have access to `gpt-4` if you decide to use it. Test your OpenAI keys outside the repo and make sure they work and that you have enough API credits.
- Check that you don't have multiple OPENAPI keys in your global environment. If you do, the local `env` file from the project will be overwritten by the system's `env` variable.
- Try to hard code your API keys into the `process.env` variables.

**Pinecone errors**

- Make sure your Pinecone dashboard `environment` and `index` match the ones in the `pinecone.ts` and `.env` files.
- Check that you've set the vector dimensions to `1536`.
- Make sure your Pinecone namespace is in lowercase.
- Pinecone indexes of users on the Starter (free) plan are deleted after 7 days of inactivity. To prevent this, send an API request to Pinecone to reset the counter before 7 days.
- Retry from scratch with a new Pinecone project, index, and cloned repo.

## Credit

This project is forked and customized from "GPT-4 & LangChain - Create a ChatGPT Chatbot for Your PDF Files":
[GitHub Repository](https://github.com/mayooear/gpt4-pdf-chatbot-langchain)

This fork will include customizations to become a more generalized chatbot.

### 2023 Chris Kennedy The Groovy Organization
