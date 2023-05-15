import { Document } from 'langchain/document';
import { readFile } from 'fs/promises';
import { BaseDocumentLoader } from 'langchain/document_loaders';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const processedFilePath = path.resolve(__dirname, 'processedFiles.json');
let processedFiles: string[] = [];

// Load the list of processed files
if (fs.existsSync(processedFilePath)) {
  const data = fs.readFileSync(processedFilePath, 'utf8');
  processedFiles = JSON.parse(data);
}

export abstract class BufferLoader extends BaseDocumentLoader {
  constructor(public filePathOrBlob: string | Blob) {
    super();
  }

  protected abstract parse(
    raw: Buffer,
    metadata: Document['metadata'],
  ): Promise<Document[]>;

  public async load(): Promise<Document[]> {
    let buffer: Buffer;
    let metadata: Record<string, string>;
    if (typeof this.filePathOrBlob === 'string') {
      buffer = await readFile(this.filePathOrBlob);
      metadata = { source: this.filePathOrBlob };
    } else {
      buffer = await this.filePathOrBlob
        .arrayBuffer()
        .then((ab) => Buffer.from(ab));
      metadata = { source: 'blob', blobType: this.filePathOrBlob.type };
    }
    return this.parse(buffer, metadata);
  }
}

export class CustomPDFLoader extends BufferLoader {
  public async parse(
    raw: Buffer,
    metadata: Document['metadata'],
  ): Promise<Document[]> {
    if (processedFiles.includes(metadata.source)) {
      return []; // Skip if has been processed already
    }
    const { pdf } = await PDFLoaderImports();
    const parsed = await pdf(raw);
    // If successful, add file to processed list and save
    processedFiles.push(metadata.source);
    fs.writeFileSync(processedFilePath, JSON.stringify(processedFiles));
    return [
      new Document({
        pageContent: parsed.text,
        metadata: {
          ...metadata,
          pdf_numpages: parsed.numpages,
        },
      }),
    ];
  }
}

async function PDFLoaderImports() {
  try {
    // the main entrypoint has some debug code that we don't want to import
    const { default: pdf } = await import('pdf-parse/lib/pdf-parse.js');
    return { pdf };
  } catch (e) {
    console.error(e);
    throw new Error(
      'Failed to load pdf-parse. Please install it with eg. `npm install pdf-parse`.',
    );
  }
}
