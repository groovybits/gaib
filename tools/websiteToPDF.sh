#!/bin/bash

# Define the target website and output directories
proto="https"
domain="some_website.org"
path="wiki/"

url="${proto}://${domain}/${path}"

output_dir="docs"
## gz files
#filter_types="pdf,gz"
#ignore_types="tmp,html,htm,php"
filter_types="html,htm,php"
ignore_types="php"

force="yes"

# Download website
if [ -d "$force" == "no" ]; then
    echo "Skipping wget, force it if you need it"
else
    wget --no-check-certificate -r -np -nH -N --cut-dirs=1 \
        --timestamping --convert-links --no-parent -R "$ignore_types" -A "$filter_types" -P "$output_dir" "$url"
fi

# Unzip .gz files and convert to text
find "$output_dir" -iname "*.gz" -execdir sh -c 'gunzip -c "{}" > "$(basename "{}" .gz).txt"' \;

# Clean up .gz files
find "$output_dir" -iname "*.gz" -exec rm {} \;

# Convert .txt files to .pdf
find "$output_dir" -iname "*.txt" \
    -exec sh -c 'dir_path=$(dirname "{}"); base_name=$(basename "{}" .txt); echo "<pre>$(cat "{}")</pre>" > "$dir_path/$base_name.html" && wkhtmltopdf "$dir_path/$base_name.html" "$dir_path/$base_name.pdf" && rm "$dir_path/$base_name.html"' \;

# Clean up .txt files
find "$output_dir" -iname "*.txt" -exec rm {} \;

