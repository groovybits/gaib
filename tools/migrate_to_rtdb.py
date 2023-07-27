import firebase_admin
from firebase_admin import credentials, firestore, db, storage
import json
import datetime

class CustomJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, datetime.datetime):
            return obj.isoformat()
        return super().default(obj)

google_account=''

# Initialize Firestore
cred = credentials.Certificate('secrets/firebase-service-account.json')
firebase_admin.initialize_app(cred, {
    'databaseURL' : f'https://{google_account}-default-rtdb.firebaseio.com'
})
firestore_db = firestore.client()

# Initialize Realtime Database
rt_db = db.reference()

# Initialize Cloud Storage
bucket = storage.bucket('gaib')

# Get a reference to the stories collection in Firestore
stories_ref = firestore_db.collection('stories')

# Get all stories
stories = stories_ref.stream()

for story in stories:
    # Get the story data
    story_data = story.to_dict()

    # Then use this custom encoder when converting the story data to JSON
    story_json = json.dumps(story_data, cls=CustomJSONEncoder)

    # Upload the JSON file to the GCS bucket
    blob = bucket.blob(f'stories/{story.id}/data.json')
    blob.upload_from_string(story_json)

    # Create a record in the Realtime Database with the URL of the JSON file
    rt_db.child('stories').child(story.id).set({
        'url': f'https://storage.googleapis.com/gaib/stories/{story.id}/data.json',
        # Add other basic information about the story here
    })

