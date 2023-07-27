"""
import sys
import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore

# Use a service account
cred = credentials.Certificate('secrets/firebase-service-account.json')
firebase_admin.initialize_app(cred)


db = firestore.client()

# Create a reference to the users collection
users_ref = db.collection(u'stories')

# Create a query against the collection
##
#end = new Date('2018-01-01');
query_ref = users_ref.where(u'name', u'not-in', [u'', u'', u''])

# Check command line argument
if len(sys.argv) > 1 and sys.argv[1] == 'delete':
    # Run the query and delete matching documents
    for doc in query_ref.stream():
        print(f'Deleting doc {doc.id} => {doc.to_dict()}')
        doc.reference.delete()
else:
    # Run the query and list matching documents
    for doc in query_ref.stream():
        print(f'Found doc {doc.id} => {doc.to_dict()}')
"""

import datetime
import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore

really_doit = True

# Use a service account
cred = credentials.Certificate('secrets/firebase-service-account.json')
firebase_admin.initialize_app(cred)

db = firestore.client()

# Define the cutoff date
cutoff_date = datetime.datetime(2023, 7, 19, tzinfo=datetime.timezone.utc)

# Get a reference to the stories collection
stories_ref = db.collection('stories')

# Get all stories
stories = stories_ref.stream()

for story in stories:
    # Get the story data
    story_data = story.to_dict()

    # Check if the story has a 'timestamp' field
    if 'timestamp' in story_data:
        # Get the creation date of the story
        created_date = story_data['timestamp']

        # If the story is older than the cutoff date, delete it
        if created_date < cutoff_date:
            if really_doit:
                print(f'Deleting story {story.id}')
                stories_ref.document(story.id).delete()
            else:
                print(f'Would delete story {story.id} {created_date}')
