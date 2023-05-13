#!/usr/local/bin/python3
import os
import sys
from google.cloud import texttospeech
from PyPDF2 import PdfFileReader

# Set environment variable
#os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = 'path_to_your_google_api_key.json'

def extract_text_from_pdf(pdf_file):
    with open(pdf_file, 'rb') as file:
        pdf = PdfFileReader(file)
        text = ""
        for page_num in range(pdf.getNumPages()):
            text += pdf.getPage(page_num).extractText()
        return text

def text_to_speech(text):
    client = texttospeech.TextToSpeechClient()

    synthesis_input = texttospeech.SynthesisInput(text=text)

    voice = texttospeech.VoiceSelectionParams(
        language_code="en-US",
        ssml_gender=texttospeech.SsmlVoiceGender.MALE,
    )

    audio_config = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.MP3
    )

    response = client.synthesize_speech(
        input=synthesis_input, voice=voice, audio_config=audio_config
    )

    with open("output.mp3", "wb") as out:
        out.write(response.audio_content)
        print('Audio content written to file "output.mp3"')

    os.system("mpg321 output.mp3")

def main():
    if len(sys.argv) != 2:
        print("Usage: python3 tts.py <textfile_or_pdffile>")
        return

    file = sys.argv[1]
    if file.lower().endswith('.pdf'):
        text = extract_text_from_pdf(file)
    else:
        with open(file, 'r') as text_file:
            text = text_file.read().replace('\n', ' ')
    text_to_speech(text)

if __name__ == "__main__":
    main()

