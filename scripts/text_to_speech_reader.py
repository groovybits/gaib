#!/usr/local/bin/python3

import os
import sys
from gtts import gTTS

def text_to_speech(text_file):
    with open(text_file, 'r') as file:
        text = file.read().replace('\n', ' ')
    speech = gTTS(text=text, lang='en')
    speech.save("output.mp3")
    os.system("mpg321 output.mp3")

def main():
    if len(sys.argv) != 2:
        print("Usage: python3 tts.py <textfile>")
        return

    text_file = sys.argv[1]
    text_to_speech(text_file)

if __name__ == "__main__":
    main()

