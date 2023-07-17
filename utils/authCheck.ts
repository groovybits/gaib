import { admin } from '@/config/firebaseAdminInit';
import type { NextApiRequest, NextApiResponse } from 'next';

// Extend the NextApiRequest type to include a user property
export interface NextApiRequestWithUser extends NextApiRequest {
    user?: admin.auth.DecodedIdToken;
}

export const authCheck = async (req: NextApiRequestWithUser, res: NextApiResponse, next: () => void) => {
    const token = req.headers.authorization?.split(' ')[1];
    const authEnabled = process.env.NEXT_PUBLIC_ENABLE_AUTH === 'true' ? true : false;

    if (!authEnabled) {
        // auth not enabled, let the request through
        next();
        return;
    }

    if (!token) {
        console.log(`authCheck: No token provided for request ${req.url} from ${req.headers['x-forwarded-for']} - ${req.headers['user-agent']}`);
        return res.status(401).send('Unauthorized: No token provided');
    }

    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken;
        next();
    } catch (error) {
        console.log(`authCheck: Invalid token for request ${req.url} from ${req.headers['x-forwarded-for']} - ${req.headers['user-agent']}`, error);
        return res.status(401).send('Unauthorized: Invalid token');
    }
};
