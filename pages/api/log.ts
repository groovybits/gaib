import type { NextApiRequest, NextApiResponse } from 'next';

const logHandler = async (req: NextApiRequest, res: NextApiResponse) => {
    if (req.method === 'POST') {
    const { message, level } = req.body;
    console.log(message)
    res.status(200).json({ message: 'OK' });
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
};
export default logHandler;
