export type SpeakerConfig = {
    rate: number;
    pitch: number;
    emphasisWords?: string[];
    pauses?: { word: string; duration: string }[];
};