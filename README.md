# Groovy AI Bot (GAIB): Fan Fiction Generation and QA Chain Iteration

**Project by Chris Kennedy**

The Groovy AI Bot (GAIB) is a multilingual chatbot capable of understanding, speaking, and translating any language in both text and audio formats. It can adopt various AI bot modes or personalities, each tailored for specific tasks. GAIB also features an Anime generation theme that crafts stories based on data from PDFs stored in the vector database. You can try it out [here](https://gaib.groovy.org).

Twitch stream of GAIB: [groovyaibot](https://twitch.tv/groovyaibot)

## Key Features

- **Fan Fiction Episode Script Generation**: GAIB can generate a series of story episodes for a "season" set, maintaining context throughout.
- **Question Iteration**: GAIB allows a chain of questions and answers following an initial question.
- **Speaking**: GAIB supports multilingual speech, differentiating between male and female speakers and various actors' voices.
- **Listening**: Users can speak into GAIB for voice command control.
- **Chat Context and Episodic Story Context**: These features enable the creation of story arcs.
- **Configurable Personalities**: GAIB can adopt many modes.
- **Story or Question Mode**: Each personality can operate in either story or question mode.
- **Subtitles**: GAIB provides multilingual subtitles of Anime quality.
- **Meme Images**: GAIB generates meme images for each subtitle line, enabling visual storytelling via memes.
- **Control**: Users can control the number of maxTokens, documents used, and the number of episodes created on a topic.
- **Transcript View**: Users can copy/paste the markup output.
- **Anime View Mode or Basic Terminal Output Mode**: Users can choose between these two modes.
- **Full-Screen View**: This feature allows display of only the images and subtitles or terminal output on TVs etc. casting.
- **User Login**: GAIB tracks tokens per user via Firebase.
- **Stripe Payments**: GAIB supports Stripe payments for premium users with token allocation per month. Free user tokens can be configured.
- **News Feed via Mediastack**: GAIB supports newsfeed input for generation of the output, currently Mediastack is supported.

## AI Bot Modes

GAIB can adopt various modes, including:

1. **Anime**: Creates Anime-like stories based on the given context and story direction.
2. **Stories**: Creates a short story based on the given context and story direction, using characters from the context.
3. **Video Engineer**: Answers questions about video and audio media handling, using the context to solve problems.
4. **Therapist**: Provides advice on mindfulness and meditation techniques based on the context and question.
5. **Poet**: Creates poems inspired by the context and suggested characters.
6. **Engineer**: Designs software architecture based on the context and direction given.
7. **Coder**: Creates software based on the context and coding task.
8. **Interviewer**: Conducts a software engineer job interview, focusing on video-related questions.
9. **Religious Modes**: GAIB can answer questions or tell stories using references from various religious scriptures, including Hebrew, Christian, Muslim, Buddhist, Cactus, Vedic, and BookOfMormon.

The ultimate goal of GAIB is to ingest and create personalities for a universal, wise AI Bot that is groovy.

## Text to Speech Setup

To set up Google Cloud authentication for the Text-to-Speech API, follow these steps:

1. Get a GCP Google Cloud account: [Getting Started](https://cloud.google.com/docs/authentication/getting-started)
2. Create a new project in the Google Cloud Console.
3. Enable the Google Text-to-Speech API for your project.
4. Create a service account in your project and download the service account key as a JSON file.
5. Set the `GOOGLE_APPLICATION_CREDENTIALS` `.env` environment variable to the

path of your downloaded JSON file.
6. Enable Google Text Translation API for your project.
7. Get the Google Text Translation API Key and add it into `.env` (see `.env.example`).
8. Get a pexels.com API key and put it in `.env` (Pexels is free). [Pexels API](https://www.pexels.com/api/)
9. Set up a Firebase DB and Stripe payments: [Setup Guide](https://blog.jarrodwatts.com/set-up-subscription-payments-with-stripe-using-firebase-and-nextjs)

The tech stack used includes LangChain, Pinecone, TypeScript, OpenAI, and Next.js. LangChain is a framework that makes it easier to build scalable AI/LLM apps and chatbots. Pinecone is a vector store for storing embeddings and your PDF in text to later retrieve similar docs.

## Development

To get started with development, follow these steps:

1. Clone the repo: `git clone [github https url]`
2. Install packages: `pnpm install`
3. Set up your `.env` file:
   - Copy `.env.example` into `.env`. Your `.env` file should look like this: [Example](https://github.com/groovybits/gaib/blob/main/.env.example)
   - Visit [OpenAI](https://help.openai.com/en/articles/4936850-where-do-i-find-my-secret-api-key) to retrieve API keys and insert them into your `.env` file.
   - Visit [Pinecone](https://pinecone.io/) to create and retrieve your API keys, and also retrieve your environment and index name from the dashboard.
4. Set up the `PINECONE_NAME_SPACE` in `.env` with a `namespace` where you'd like to store your embeddings on Pinecone when you run `pnpm run ingest`. This namespace will later be used for queries and retrieval. The different personalities check if the namespace exists for their names too, so they can focus on a set of data.
5. In `utils/makechain.ts`, you'll find the main OpenAI SDK code. Change `modelName` in `new OpenAIChat` to `gpt-3.5-turbo` if you don't have access to `gpt-4`. Please verify outside this repo that you have access to `gpt-4`, otherwise the application will not work with it. There are personalities setup in [personalityPrompts.ts](https://github.com/groovybits/gaib/blob/main/config/personalityPrompts.ts)

## Convert your PDF files to embeddings

This repo can load multiple PDF files:

1. Inside the `docs` folder, add your PDF files or folders containing PDF files.
2. Run the script `npm run ingest <namespace>` to 'ingest' and embed your docs. If you run into errors, troubleshoot below.
3. Check the Pinecone dashboard to verify your namespace and vectors have been added.

## Run the app

Once you've verified that the embeddings and content have been successfully added to your Pinecone, you can run the app `pnpm run dev` to launch the local dev environment, and then type a question in the chat interface.

## Troubleshooting

This project is moving fast and furious. If you have any questions, please ask by filing a ticket on GitHub, and help will be provided. Contributions are even better!

For general errors, make sure you're running the latest Node version, try a different PDF or convert your PDF to text first, `console.log` the `env` variables to make sure they are exposed, and ensure you're using the same versions of LangChain and Pinecone as this repo.

For Pine

cone errors, ensure your Pinecone dashboard `environment` and `index` match the ones in the `pinecone.ts` and `.env` files, check that you've set the vector dimensions to `1536`, and ensure your Pinecone namespace is in lowercase. Pinecone indexes of users on the Starter (free) plan are deleted after 7 days of inactivity. To prevent this, send an API request to Pinecone to reset the counter before 7 days. If all else fails, retry from scratch with a new Pinecone project, index, and cloned repo.

## Credit

This project is a fork and customization of "GPT-4 & LangChain - Create a ChatGPT Chatbot for Your PDF Files". You can find the original project [here](https://github.com/mayooear/gpt4-pdf-chatbot-langchain). This fork includes customizations to become a more generalized chatbot.

© 2023 Chris Kennedy, The Groovy Organization
