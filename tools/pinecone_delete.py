import calendar
from datetime import datetime, timedelta
import os
import requests

def generate_month_year_list(start_date, end_date):
    month_years = []
    while start_date <= end_date:
        month_years.append((start_date.year, start_date.month))
        start_date += timedelta(days=32)  # Add days greater than a month to ensure next month
        start_date = start_date.replace(day=1)
    return month_years

def delete_vectors(year, month):
    pinecone_index_name= os.environ["PINECONE_INDEX_NAME"]
    pinecone_name_space = os.environ["PINECONE_NAME_SPACE"]
    pinecone_region = os.environ["PINECONE_ENVIRONMENT"]
    pinecone_url = os.environ["PINECONE_URL"]
    pinecone_api_key = os.environ["PINECONE_API_KEY"]

    # -H "Api-Key: 594a5a09-1b60-4198-abf7-1a3e1c9d3f48" -H "Content-Type: application/json"

    # "/Users/christi/src/gaib/docs/ffmpeg-devel/2006-November.txt.pdf"

    # -d '{"filter":{"source":{"$in":["/Users/christi/src/gaib/docs/ffmpeg-devel/2008-July.txt.pdf"]}}}'

    url = f"https://{pinecone_index_name}-{pinecone_url}.svc.{pinecone_region}.pinecone.io/vectors/delete?namespace={pinecone_name_space}"
    print("URL: %s\n" % url)
    headers = {
        "Api-Key": pinecone_api_key,
        "Content-Type": "application/json"
    }
    print("Headers: %s\n" % headers)
    data = {
        "filter": {
            "source": {
                "$in": [f"/Users/christi/src/gaib/docs/ffmpeg-devel/{year}-{month}.txt.pdf"]
            }
        }
    }
    print("Data: %s\n" % data)
    response = requests.post(url, headers=headers, json=data)
    return response

start_date = datetime(2004, 1, 1)
end_date = datetime(2023, 4, 1)

month_years = generate_month_year_list(start_date, end_date)

for year, month in month_years:
    month_name = calendar.month_name[month]
    response = None
    response = delete_vectors(year, month_name)
    print(f"Deleting vectors for {year}-{month_name}:")
    if response:
        response_json = response.json()
        print(f"  Response: {response_json}\n")
        print(f"  Status: {response.status_code}\n")
        print(f"  Body: {response.text}\n")

