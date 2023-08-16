import { admin } from '@/config/firebaseAdminInit';
import type { NextApiRequest, NextApiResponse } from 'next';
// Extend the NextApiRequest type to include a user property
export interface NextApiRequestWithUser extends NextApiRequest {
  user?: admin.auth.DecodedIdToken;
}
const emailAccess: string = process.env.EMAIL_ACCESS ? process.env.EMAIL_ACCESS : 'all';

// Helper function to introduce a delay
const sleep = (ms: number) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export const authCheck = async (req: NextApiRequestWithUser, res: NextApiResponse, next: () => void) => {
  const MAX_RETRIES = 3; // Maximum number of retries
  let retryCount = 0;
  const authEnabled = process.env.NEXT_PUBLIC_ENABLE_AUTH === 'true' ? true : false;

  if (!authEnabled) {
    // auth not enabled, let the request through
    next();
    return;
  }

  while (retryCount < MAX_RETRIES) {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      console.log(`authCheck: No token provided for request ${req.url} from ${req.headers['x-forwarded-for']} - ${req.headers['user-agent']}`);
      return res.status(401).send('Unauthorized: No token provided');
    }

    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      req.user = decodedToken;

      try {
        if (emailAccess === 'all') {
          // allow all by default if no emails given
        } else {
          // Get the list of allowed emails from Firebase config
          const allowedEmails = emailAccess;

          // If there are no allowed emails set, let the request through
          if (!allowedEmails || allowedEmails.length === 0) {
            next();
            return;
          }

          // Check if the user's email is in the list of allowed emails
          if (decodedToken.email && !allowedEmails.includes(decodedToken.email)) {
            console.log(`authCheck: User's email is not in the list of allowed emails for request ${req.url} from ${req.headers['x-forwarded-for']} - ${req.headers['user-agent']}`);
            return res.status(401).json({
              message: 'Unauthorized: Your email is not in the list of allowed emails. Please contact the administrator for access.'
            });
          }
        }
      } catch (error) {
        console.log(`authCheck: Error getting allowed emails for request ${req.url} from ${req.headers['x-forwarded-for']} - ${req.headers['user-agent']}`, error);
        return res.status(401).send('Unauthorized: Error getting allowed emails');
      }

      // If successful, break out of the loop
      break;
    } catch (error) {
      console.log(`authCheck: Invalid token for request ${req.url} from ${req.headers['x-forwarded-for']} - ${req.headers['user-agent']}`, error);
      retryCount++;
      await sleep(1000); // Wait for 1 second before retrying
      continue;
    }
  }

  if (retryCount === MAX_RETRIES) {
    return res.status(401).send('Unauthorized: Invalid token after maximum retries.');
  }

  next();
};
