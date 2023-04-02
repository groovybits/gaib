

curl -i -X POST "https://${1}-${2}.svc.${3}.pinecone.io/vectors/delete?namespace=${4}" \
  -H "Api-Key: ${5}" \
  -H 'Content-Type: application/json' \
  -d '{
    "filter": {"source": {"$in": ["${6}"]}}
  }'

