Yes, you should include the `functions` directory in your git repository. This will allow other developers who clone your project to have access to the Firebase Cloud Functions code and set up the project correctly.

You can create a `README_FIREBASE.md` file that explains the steps to set up Firebase for this project. Here's an example of what you can include in the `README_FIREBASE.md` file:

```
# Firebase Setup

This project uses Firebase for authentication and Cloud Functions. To set up Firebase for this project, follow these steps:

1. Install Firebase CLI:
   ```
   npm install -g firebase-tools
   ```

2. Sign in to your Firebase account:
   ```
   firebase login
   ```

3. Create a new Firebase project (or use an existing one) by following the instructions on the Firebase Console (https://console.firebase.google.com/).

4. In the root directory of the project, initialize Firebase by running:
   ```
   firebase init
   ```

   During initialization, choose Firestore, Functions, and Hosting, and select the project you created in step 3.

5. Set up environment variables for your Firebase project remotely so they are secure. See .env in the main gaib directory for other values.
   ```
   firebase functions:config:set stripe.premium_token_balance="5000000"
   firebase functions:config:set stripe.trial_token_balance="50000"
   firebase functions:config:set stripe.secret="YOUR_STRIPE_SECRET_KEY"
   firebase functions:config:set stripe.webhook_secret="YOUR_STRIPE_WEBHOOK_SECRET"
   firebase functions:config:set stripe.cords="https://your.host.com.none"

   firebase deploy --only functions
   ```

6. Deploy the Cloud Functions:
   ```
   npx eslint --fix functions/src/index.ts
   firebase deploy --only functions
   ```

Now you have set up Firebase for this project. The project should work as expected with the Firebase services.
```

Include this `README_FIREBASE.md` file in your git repository so that other developers can follow these steps to set up Firebase for the project.
