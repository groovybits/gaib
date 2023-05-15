#!/usr/local/bin/python3

import os
import spacy
from nltk.tokenize import sent_tokenize
from fpdf import FPDF
import multiprocessing
import re

nlp = spacy.load('en_core_web_sm')

def is_ffmpeg_log(line):
    patterns = [
        r'\[.* @ 0x.*\]',  # [module @ memory address]
        r'\d+:\d+:\d+.\d+',  # timestamp
        r'bitrate=.*kbits/s',  # bitrate
        r'Last message repeated \d+ times',  # "Last message repeated X times"
        r'--enable-',  # ffmpeg enable flags
        r'<.*@.*>',  # email headers
    ]
    for pattern in patterns:
        if re.search(pattern, line):
            return True
    return False

def clean_email_reply(line):
    cleaned_line = re.sub(r'^>+ ', '', line)
    # Check if line is empty after removing reply prefix
    return cleaned_line if cleaned_line.strip() else None

def filter_ffmpeg_logs(text):
    lines = text.split('\n')
    filtered_lines = []
    for line in lines:
        if is_ffmpeg_log(line):
            continue
        line = clean_email_reply(line)
        if line is not None:  # if line is not empty
            filtered_lines.append(line)
    return '\n'.join(filtered_lines)

def is_human_sentence(sentence):
    # Let's say a human sentence has at least one verb and one noun
    doc = nlp(sentence)
    verbs = [token for token in doc if token.pos_ == "VERB"]
    nouns = [token for token in doc if token.pos_ == "NOUN"]
    return len(verbs) > 0 and len(nouns) > 0

def remove_non_latin1_characters(text):
    return text.encode('latin-1', errors='ignore').decode('latin-1')

def create_pdf(filename_text):
    filename, text = filename_text
    text = filter_ffmpeg_logs(text)
    # First, split the text into sentences
    sentences = sent_tokenize(text)
    # Then, filter out the non-human sentences
    human_sentences = [sentence for sentence in sentences if is_human_sentence(sentence)]
    # Finally, create the PDF
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Arial", size = 15)
    for sentence in human_sentences:
        sentence = remove_non_latin1_characters(sentence)
        sentence_lines = pdf.multi_cell(0, 10, txt=sentence)
        pdf.ln()
    pdf_filename = os.path.splitext(filename)[0] + ".pdf"
    print("file: %s" % pdf_filename)
    pdf.output(pdf_filename)

def process_directory(dir_path):
    # load text files and their contents
    text_files_content = []
    for file in os.listdir(dir_path):
        if file.endswith('.txt'):
            pdf_filename = os.path.splitext(os.path.join(dir_path, file))[0] + ".pdf"
            if os.path.exists(pdf_filename):
                print(f"PDF file {pdf_filename} already exists. Skipping...")
                continue
            try:
                with open(os.path.join(dir_path, file), encoding='utf-8') as f:
                    text_files_content.append((os.path.join(dir_path, file), f.read()))
            except UnicodeDecodeError:
                with open(os.path.join(dir_path, file), encoding='ISO-8859-1') as f:
                    text_files_content.append((os.path.join(dir_path, file), f.read()))
    pool = multiprocessing.Pool()
    pool.map(create_pdf, text_files_content)

if __name__ == "__main__":
    process_directory('docs/pipermail/ffmpeg-user/')
    process_directory('docs/pipermail/ffmpeg-devel/')

