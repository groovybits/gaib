import sys
import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore

# Use a service account
cred = credentials.Certificate('secrets/firebase-service-account.json')
firebase_admin.initialize_app(cred)

db = firestore.client()

# Create a reference to the users collection
users_ref = db.collection(u'users')

# Create a query against the collection
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

