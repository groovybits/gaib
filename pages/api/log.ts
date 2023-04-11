import type { NextApiRequest, NextApiResponse } from 'next';
import logger from '@/utils/logger';

const logHandler = async (req: NextApiRequest, res: NextApiResponse) => {
    if (req.method === 'POST') {
    const { message, level } = req.body;
    logger.log(level || 'info', message);
    res.status(200).json({ message: 'OK' });
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
};
export default logHandler;
