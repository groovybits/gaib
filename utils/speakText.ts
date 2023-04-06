// Description: This file contains the function to speak text using the Google Text-to-Speech API
// 
  
export const speakText = async (text: string) => {
    try {
      let apiBaseUrl = typeof window !== 'undefined' ? window.location.origin : '';
      if (!apiBaseUrl || apiBaseUrl === '') {
        apiBaseUrl = 'http://127.0.0.1:3000';
      }
      if (typeof window === 'undefined') {
        console.log('Audio playback is not available in this environment');
        return;
      }
      const response = await fetch(`${apiBaseUrl}/api/synthesizeSpeech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
  
      if (!response.ok) {
        throw new Error('Error in synthesizing speech, statusText: ' + response.statusText);
      }
  
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.play();
    } catch (error) {
      console.error('Error in synthesizing speech, error:', error);
    }
  }  