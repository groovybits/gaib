# Docker and Cloud Build

The GAIB project includes a Dockerfile and a cloudbuild.yaml file to facilitate deployment on Google Cloud Run using Google Cloud Build. Here's a step-by-step guide on how to set up and deploy the project using these files:

## Dockerfile

The Dockerfile is a script that Docker reads to build an image. In this project, the Dockerfile does the following:

1. It sets up a Node.js environment by pulling a Node.js Docker image.
2. It sets the working directory in the Docker image to `/app`.
3. It copies the package.json and pnpm-lock.yaml files to the Docker image and installs the project dependencies using `pnpm install`.
4. It then copies the rest of the project files to the Docker image.
5. It exposes port 3000 for the application to be accessible.
6. Finally, it starts the application using the command `pnpm run start`.

## Environment Variables in Docker

Environment variables that are used in the Dockerfile are defined in the `.env` file. However, for security reasons, you should not include your `.env` file in the Docker image. Instead, you should use Docker's `-e` flag to set environment variables when you run the Docker container.

For example, if you have an environment variable named `OPENAI_API_KEY`, you would run your Docker container like this:

```bash
docker run -e OPENAI_API_KEY=<your_open_ai_key_here> -p 3000:3000 <image_name>
```

- See [Dockerfile](Dockerfile)

## Google Cloud Build and cloudbuild.yaml

Google Cloud Build is a service that executes your builds on Google Cloud Platform. It can import source code from Google Cloud Storage, Cloud Source Repositories, GitHub, or Bitbucket, execute a build to your specifications, and produce artifacts such as Docker containers or Java archives.

The cloudbuild.yaml file is a configuration file that Google Cloud Build uses to execute your build. In this project, the cloudbuild.yaml file does the following:

1. It specifies that the build should use the Docker builder to build an image using the Dockerfile.
2. It specifies the name of the Docker image to be built and pushed to the Google Container Registry.

To deploy the project on Google Cloud Run using Google Cloud Build, you would do the following:

1. Submit a build using the Google Cloud SDK command `gcloud builds submit --config cloudbuild.yaml .`.
2. After the build completes, deploy the Docker image to Cloud Run using the command `gcloud run deploy --image gcr.io/PROJECT-ID/IMAGE`.

## Secrets in Google Cloud Build

For security reasons, you should not include sensitive information such as API keys in your source code or Docker image. Instead, you should use Secret Manager to store and access this information.

Secrets in Google Cloud Build are encrypted and can be decrypted using the `_` prefix. For example, if you have a secret named `OPENAI_API_KEY`, you would access it in your cloudbuild.yaml file like this:

cloudbuild.yaml [Cloudbuild YAML](cloudbuild.yaml)

```yaml
steps:
- name: 'gcr.io/cloud-builders/docker'
  args:
  - 'build'
  - '-t'
  - 'gcr.io/$PROJECT_ID/github.com/groovybits/gaib:$COMMIT_SHA'
  - '--build-arg'
  - 'OPENAI_API_KEY=${_OPENAI_API_KEY}'
  - '--build-arg'
  ...
```

The `<encrypted-value>` is the base64-encoded encrypted value of the secret, which you can obtain using the `gcloud` command-line tool.

Remember to replace all placeholder values with your actual values. After you've set up your

Dockerfile, cloudbuild.yaml file, and secrets, you're ready to deploy GAIB on Google Cloud Run!

## Deploying to Google Cloud Run

Google Cloud Run is a managed compute platform that enables you to run stateless containers that are invocable via HTTP requests. It abstracts away all infrastructure management, so you can focus on what matters most — building great applications.

To deploy your Docker image to Google Cloud Run, follow these steps:

1. Ensure you have the [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) installed and initialized with `gcloud init`.

2. Submit your build to Google Cloud Build with the following command:

```bash
gcloud builds submit --config cloudbuild.yaml .
```

This command tells Google Cloud Build to start a new build using the configuration specified in `cloudbuild.yaml`.

3. After the build completes, you'll see an output similar to this:

```bash
SUCCESS
---------------------------------------------------------------------------------------
ID                                    CREATE_TIME                DURATION  SOURCE                                                                                     IMAGES                                       STATUS
a1b2c3d4-5678-90ab-cdef-ghijklmnopqr  2023-06-28T12:34:56+00:00  3M10S     gs://project-id_cloudbuild/source/1234567890.12-abcd1234abcd1234abcd1234abcd1234abcd.tar.gz  gcr.io/project-id/image (+1 more)  SUCCESS
```

The `IMAGES` column contains the name of the Docker image that was built and pushed to the Google Container Registry.

4. Deploy the Docker image to Google Cloud Run with the following command:

```bash
gcloud run deploy --image gcr.io/PROJECT-ID/IMAGE --platform managed
```

Replace `PROJECT-ID` with your Google Cloud project ID and `IMAGE` with the name of the Docker image.

5. During the deployment, you'll be asked to specify the service name, region, and whether to allow unauthenticated invocations. After the deployment completes, you'll see an output similar to this:

```bash
Deploying container to Cloud Run service [service-name] in project [project-id] region [region] 
✓ Deploying new service... Done.                                                                                                                                     
  ✓ Creating Revision...                                                                                                                                             
  ✓ Routing traffic...                                                                                                                                                
  ✓ Setting IAM Policy...                                                                                                                                            
Done.                                                                                                                                                                
Service [service-name] revision [service-name-00001-xyz] has been deployed and is serving 100 percent of traffic.
Service URL: https://service-name-xyz-ue.a.run.app
```

The `Service URL` is the public URL of your deployed application.

6. Visit the service URL in your web browser to see your deployed application.

Remember to replace all placeholder values with your actual values. After you've deployed your application, you're ready to use GAIB on Google Cloud Run!
