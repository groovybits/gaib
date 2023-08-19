import { PERSONALITY_PROMPTS } from '@/config/personalityPrompts';

export interface Sentence {
    id: number;
    text: string;
    imageUrl: string;
    speaker: string;
    gender: string;
    language: string;
    model: any;
    audioFile: string;
}

export interface Scene {
    id: number;
    sentences: Sentence[];
    imageUrl: string;
    imagePrompt: string;
}

export type Story = {
    id: string;
    url: string;
    UserId: string;
    prompt: string;
    tokens: number;
    title: string;
    imageUrl: string;
    imagePrompt: string;
    scenes: Scene[];
    thumbnailUrls: string[];
    timestamp: number;
    personality: string;
    namespace: string;
    references: any[] | undefined;
    isStory: boolean;
    shareUrl: string;
    query: string;
    rawText: string;
    documentCount: number;
    episodeCount: number;
    gptModel: string;
    gptFastModel: string;
    defaultGender: string;
    defaultVoiceModel: string;
    defaultVoicePitch: number;
    defaultVoiceRate: number;
    speakingLanguage: string;
    subtitleLanguage: string;
    gptPrompt: string;
}

// Define a type for an episode
export type Episode = {
    title: string;
    type: string;
    username: string;
    namespace: string;
    personality: string;
    refresh: boolean;
    prompt: string;
    sourceDocs: string[];
    documentCount: number;
    episodeCount: number;
    gptModel: string;
    gptFastModel: string;
    defaultGender: string;
    speakingLanguage: string;
    subtitleLanguage: string;
    gptPrompt: string;
};
