import { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import * as functions from "firebase-functions";
import { authCheck, NextApiRequestWithUser } from '@/utils/authCheck';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2022-11-15",
});

export default async function handler(req: NextApiRequestWithUser, res: NextApiResponse) {
  await authCheck(req, res, async () => {
    if (req.method === "POST") {
      const { priceId } = req.body;

      try {
        const price = await stripe.prices.retrieve(priceId);
        res.status(200).json(price);
      } catch (error) {
        if (error instanceof Stripe.errors.StripeError) {
          res.status(400).json({ error: error.message });
        } else {
          if (error instanceof Error) {
            res.status(500).json({ error: error.message });
          } else {
            res.status(500).json({ error: "An Unknown Error Occurred." });
          }
        }
      }
    } else {
      res.setHeader("Allow", "POST");
      res.status(405).end("Method Not Allowed");
    }
  });
}
