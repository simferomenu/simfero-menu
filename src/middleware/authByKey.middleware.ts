import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class authByKey implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    if (['/webhook/call'].includes(req.url)) {
      return next();
    }

    if (req.headers.publickey === process.env.PIBLIC_KEY) {
      next();
    } else {
      return res.status(403).json({ message: 'Auth error' });
    }
  }
}
