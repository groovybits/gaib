import fs from 'fs';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { OpenAIEmbeddings } from 'langchain/embeddings/openai';
import { PineconeStore } from 'langchain/vectorstores/pinecone';
import { pinecone } from '@/utils/pinecone-client';
import { PDFLoader } from 'langchain/document_loaders/fs/pdf';
import { PINECONE_INDEX_NAME, PINECONE_NAME_SPACE } from '@/config/pinecone';
import { DirectoryLoader } from 'langchain/document_loaders/fs/directory';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import compromise from 'compromise';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* Name of directory to retrieve your files from */
const filePath = 'docs';
// Load the list of processed files
const processedFilePath = path.join(__dirname, 'processedFiles.json');
let processedFiles : any[] = [];
try {
  processedFiles = JSON.parse(fs.readFileSync(processedFilePath, 'utf-8'));
} catch (e) {
  processedFiles = [];
}

import { BaseDocumentLoader } from 'langchain/document_loaders';
import { Document } from 'langchain/document';

const nlp = compromise;

function is_ffmpeg_log(line: string): boolean {
  const patterns = [
    '\\[.* @ 0x.*\\]',  // [module @ memory address]
    '\\d+:\\d+:\\d+.\\d+',  // timestamp
    'bitrate=.*kbits/s',  // bitrate
    'Last message repeated \\d+ times',  // "Last message repeated X times"
    '--enable-',  // ffmpeg enable flags
    '<.*@.*>',  // email headers
  ];
  
  return patterns.some(pattern => new RegExp(pattern).test(line));
}

function clean_email_reply(line: string): string | null {
  const cleanedLine = line.replace(/^>+ /, '');
  return cleanedLine.trim() ? cleanedLine : null;
}

function filter_ffmpeg_logs(text: string): string {
  const lines = text.split('\n');
  const filteredLines = lines.filter(line => {
    if (is_ffmpeg_log(line)) return false;
    const cleanedLine = clean_email_reply(line);
    return cleanedLine !== null;
  });
  return filteredLines.join('\n');
}

function is_human_sentence(sentence: string): boolean {
  const doc = nlp(sentence);
  const verbs = doc.verbs().out('array');
  const nouns = doc.nouns().out('array');
  return verbs.length > 0 && nouns.length > 0;
}

async function createPdf(input: [string, string]) {
  const [filename, text] = input;

  let filteredText = filter_ffmpeg_logs(text);
  let sentences = nlp(filteredText).sentences().out('array');
  let humanSentences = sentences.filter((sentence: string) => is_human_sentence(sentence));

  const pdfDoc = await PDFDocument.create();
  const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const page = pdfDoc.addPage();
  const { height } = page.getSize();
  const fontSize = 24;
  let i = 0;

  for (const sentence of humanSentences) {
    const lines = sentence.split('\n');
    for (const line of lines) {
      // Replace non-breaking hyphens with regular hyphens
      const cleanedLine = line.replace(/\u2011/g, '-')
                              .replace(/\u200B/g, ''); // remove zero width space
  
      const textWidth = fontSize * cleanedLine.length;
      page.drawText(cleanedLine, {
        x: 50,
        y: height - 4 * fontSize * i++,
        size: fontSize,
        font: timesRomanFont,
        color: rgb(0, 0, 0),
        maxWidth: textWidth,
        wordBreaks: [cleanedLine]
      });
    }
  }  

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(filename.replace('.txt', '.pdf'), pdfBytes);
}

class TextLoader extends BaseDocumentLoader {
  constructor(public path: string) {
    super();
  }

  async load(): Promise<Document[]> {
    if (fs.existsSync(this.path.replace('.txt', '.pdf')) || processedFiles.includes(this.path)) {
      return []; // Skip if PDF already exists or has been processed already
    }

    let data = fs.readFileSync(this.path, 'utf-8');

    await createPdf([this.path, data]);

    // If successful, add file to processed list and save
    processedFiles.push(this.path);
    fs.writeFileSync(processedFilePath, JSON.stringify(processedFiles));

    return [
      new Document({
        pageContent: data,
        metadata: {
          source: this.path,
        },
      }),
    ];
  }
}

class JsonLoader extends BaseDocumentLoader {
  constructor(public path: string) {
    super();
  }

  async load(): Promise<Document[]> {
    let data = fs.readFileSync(this.path, 'utf-8');
    const parsedData = JSON.parse(data);
    // Assuming each JSON object represents a separate document
    // and each has a 'text' property.
    return parsedData.map((item : any) =>
      new Document({
        pageContent: item.text,
        metadata: {
          source: this.path,
          // Add any other metadata fields as necessary.
        },
      })
    );
  }
}

export const run = async (namespace : string, filePath: string, testMode : boolean) => {
  try {
    const stats = fs.statSync(filePath);
    let rawDocs: Document<Record<string, any>>[] | undefined;

    if (stats.isDirectory()) {
      const directoryLoader = new DirectoryLoader(filePath, {
        '.pdf': (path) => new PDFLoader(path),
        '.txt': (path) => new TextLoader(path),
        '.json': (path) => new JsonLoader(path),
      });

      rawDocs = await directoryLoader.load();
    } else if (stats.isFile()) {
      const fileExtension = path.extname(filePath);
      let fileLoader;

      switch(fileExtension) {
        case '.pdf':
          fileLoader = new PDFLoader(filePath);
          break;
        case '.txt':
          fileLoader = new TextLoader(filePath);
          break;
        case '.json':
          fileLoader = new JsonLoader(filePath);
          break;
        default:
          throw new Error('Unsupported file extension');
      }

      rawDocs = await fileLoader.load();
    }

    // Skip to next file if no documents found
    if (!rawDocs || rawDocs.length === 0) {
      console.log(`No documents found in ${filePath}. Skipping to next file.`);
      return;
    }

    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const docs = await textSplitter.splitDocuments(rawDocs);

    if (testMode) {
      console.log('In test mode. Here are the first 10 split documents:\n', docs.slice(0, 10));
      console.log('In test mode. Would have created vector store and embedded documents.');
      return;
    }

    console.log('split docs', docs);

    console.log('creating vector store...');
    const embeddings = new OpenAIEmbeddings();
    const index = pinecone.Index(PINECONE_INDEX_NAME);

    await PineconeStore.fromDocuments(docs, embeddings, {
      pineconeIndex: index,
      namespace: namespace,
      textKey: 'text',
    });
  } catch (error) {
    console.log('error', error);
  }
};

(async () => {
   const namespaceArg = process.argv[2] || null;
   const inputPath = process.argv[3] || null;
   const testMode = process.argv[4] === 'test';

   if (!namespaceArg || !inputPath) {
     console.log('Incorrect usage. Correct usage is `pnpm run ingest <namespace> <input_file_or_directory> [test]`');
     return;
   }

   const namespace = namespaceArg.toLowerCase();
   console.log('ingesting into namespace', namespace);

   await run(namespace, inputPath, testMode);
   console.log('ingestion complete for namespace', namespace);
})();

