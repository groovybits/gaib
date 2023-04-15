import { Document } from 'langchain/document';

export type Message = {
  type: 'apiMessage' | 'userMessage' | 'systemMessage';
  message: string;
  isStreaming?: boolean;
  sourceDocs?: Document[];
};
