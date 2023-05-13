import fs from 'fs';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { OpenAIEmbeddings } from 'langchain/embeddings/openai';
import { PineconeStore } from 'langchain/vectorstores/pinecone';
import { pinecone } from '@/utils/pinecone-client';
import { CustomPDFLoader } from '@/utils/customPDFLoader';
import { PINECONE_INDEX_NAME, PINECONE_NAME_SPACE } from '@/config/pinecone';
import { DirectoryLoader } from 'langchain/document_loaders/fs/directory';

/* Name of directory to retrieve your files from */
const filePath = 'docs';

const groomMailingList = (text : any) => {
    return text.replace(/[^a-z0-9]/gi, ' ');
};

import { BaseDocumentLoader } from 'langchain/document_loaders';
import { Document } from 'langchain/document';

class TextLoader extends BaseDocumentLoader {
  constructor(public path: string) {
    super();
  }

  async load(): Promise<Document[]> {
    let data = fs.readFileSync(this.path, 'utf-8');
    data = groomMailingList(data);
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

export const run = async (namespace : string, testMode : boolean) => {
  try {
    const directoryLoader = new DirectoryLoader(filePath, {
      '.pdf': (path) => new CustomPDFLoader(path),
      '.txt': (path) => new TextLoader(path),
      '.json': (path) => new JsonLoader(path),
    });    

    const rawDocs = await directoryLoader.load();

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
    throw new Error('Failed to ingest your data');
  }
};

(async () => {
   const namespaceArg = process.argv[2] || null;
   const testMode = process.argv[3] === 'test';

   if (!namespaceArg) {
     console.log('No namespace provided, using environment variable');
     throw new Error('Please give the namespace with `pnpm run ingest -- NAME_SPACE_HERE`');
   }

   const namespace = namespaceArg.toLowerCase();
   console.log('ingesting into namespace', namespace);

   await run(namespace, testMode);
   console.log('ingestion complete for namespace', namespace);
})();

