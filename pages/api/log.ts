import type { NextApiRequest, NextApiResponse } from 'next';
import { authCheck, NextApiRequestWithUser } from '@/utils/authCheck';

const logHandler = async (req: NextApiRequestWithUser, res: NextApiResponse) => {
  await authCheck(req, res, async () => {
    if (req.method === 'POST') {
      const { message, level } = req.body;
      console.log(message)
      res.status(200).json({ message: 'OK' });
    } else {
      res.setHeader('Allow', ['POST']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  });
};
export default logHandler;
