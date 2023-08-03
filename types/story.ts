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
    references: string[];
    isStory: boolean;
    shareUrl: string;
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
};
