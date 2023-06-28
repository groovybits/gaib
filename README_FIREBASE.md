# Firebase Setup for GAIB

This document provides a detailed guide on how to set up Firebase for the GAIB project.

## Prerequisites

Before you begin, make sure you have the following:

- A Firebase account. If you don't have one, you can create one at [Firebase](https://firebase.google.com/).
- Node.js and npm installed on your machine. You can download Node.js from [here](https://nodejs.org/en/download/) and npm is included in the installation.
- Firebase CLI installed. If you don't have it installed, you can install it by running `npm install -g firebase-tools`.

## Steps

1. **Create a Firebase project:** Go to the [Firebase console](https://console.firebase.google.com/) and create a new project.

2. **Set up Firebase Authentication:** In your Firebase project, enable the authentication method you want to use. GAIB uses Firebase Authentication for user management.

3. **Set up Firestore Database:** In your Firebase project, create a Firestore database. GAIB uses Firestore to store user data and manage tokens.

4. **Set up Firebase Functions:** GAIB uses Firebase Functions for serverless backend operations. To set up Firebase Functions, follow these steps:

    - Install the Firebase Functions SDK by running `npm install firebase-functions@latest firebase-admin@latest --save` in your project directory.
    - Initialize Firebase Functions in your project by running `firebase init functions`.

5. **Configure Firebase in GAIB:** In the GAIB project, you will find a file named `config/firebase.ts`. This file contains the configuration for Firebase. Replace the placeholders in this file with your Firebase project's configuration. You can find your Firebase project's configuration in the Firebase console under Project Settings.

6. **Set up `.firebaserc`:** The `.firebaserc` file contains the Firebase project alias. Replace the placeholder in this file with your Firebase project ID.

7. **Set up Firebase Functions:** GAIB uses Firebase Functions for serverless backend operations. The functions are defined in the `functions/src/index.ts` file. These functions handle operations such as setting the initial token balance for a new user, allocating tokens on successful payment, handling Stripe webhooks, and cancelling premium subscriptions.

8. **Deploy Firebase Functions:** To deploy the Firebase Functions, run `firebase deploy --only functions` in your project directory.

9. **Set up Stripe:** GAIB uses Stripe for payments. To set up Stripe, follow these steps:

    - Create a Stripe account if you don't have one.
    - In your Stripe Dashboard, get your API keys.
    - In the GAIB project, you will find a file named `config/stripe.ts`. This file contains the configuration for Stripe. Replace the placeholders in this file with your Stripe API keys.

10. **Deploy your project:** After setting up Firebase and Stripe, you can deploy your project by running `firebase deploy`.

## Additional Resources

For more information on setting up Firebase, you can refer to the [Firebase documentation](https://firebase.google.com/docs).

For more information on setting up Stripe with Firebase, you can refer to this [Stripe Firebase extension documentation](https://firebase.google.com/products/extensions/firestore-stripe-subscriptions).

For a detailed tutorial on setting up Firebase with Stripe, you can refer to this [Stripe Firebase tutorial](https://stripe.com/docs/firebase).

For more information on Firebase Functions, you can refer to the [Firebase Functions documentation](https://firebase.google.com/docs/functions).

For more information on Stripe, you can refer to the [Stripe documentation](https://stripe.com/docs).
